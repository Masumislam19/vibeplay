// @ts-ignore OpenNext generates this file during build.
import { default as handler } from "./.open-next/worker.js";

import {
  closeMongoRequestCache,
  mongoRequestStorage,
  type MongoRequestCache,
} from "./src/db/mongo-request-context";

type OpenNextHandler = {
  fetch(
    request: Request,
    env: unknown,
    ctx: unknown,
  ): Promise<Response>;
};

type CloudflareGlobal = typeof globalThis & {
  __VIBEPLAY_CLOUDFLARE_WORKER__?: boolean;
};

// Mark this runtime so database code never uses a shared Node.js fallback.
(globalThis as CloudflareGlobal).__VIBEPLAY_CLOUDFLARE_WORKER__ = true;

const openNextHandler = handler as unknown as OpenNextHandler;

async function attachCleanup(
  response: Response,
  cache: MongoRequestCache,
): Promise<Response> {
  if (!response.body) {
    await closeMongoRequestCache(cache);
    return response;
  }

  const reader = response.body.getReader();

  let cleanupPromise: Promise<void> | undefined;

  const cleanup = () => {
    cleanupPromise ??= closeMongoRequestCache(cache);
    return cleanupPromise;
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await mongoRequestStorage.run(
          cache,
          () => reader.read(),
        );

        if (result.done) {
          controller.close();
          await cleanup();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        controller.error(error);
        await cleanup();
      }
    },

    async cancel(reason) {
      try {
        await mongoRequestStorage.run(
          cache,
          () => reader.cancel(reason),
        );
      } finally {
        await cleanup();
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export default {
  async fetch(
    request: Request,
    env: unknown,
    ctx: unknown,
  ): Promise<Response> {
    const cache: MongoRequestCache = {};

    return mongoRequestStorage.run(cache, async () => {
      try {
        const response = await openNextHandler.fetch(
          request,
          env,
          ctx,
        );

        return await attachCleanup(response, cache);
      } catch (error) {
        await closeMongoRequestCache(cache);
        throw error;
      }
    });
  },
};