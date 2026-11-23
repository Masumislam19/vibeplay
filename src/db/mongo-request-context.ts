import { AsyncLocalStorage } from "node:async_hooks";
import type { MongoClient } from "mongodb";

export interface MongoRequestCache {
  uri?: string;
  client?: MongoClient;
  clientPromise?: Promise<MongoClient>;
}

type MongoGlobal = typeof globalThis & {
  __vibePlayMongoRequestStorage?: AsyncLocalStorage<MongoRequestCache>;
};

const globalForContext = globalThis as MongoGlobal;

// Share the SAME AsyncLocalStorage instance across OpenNext bundles.
export const mongoRequestStorage =
  globalForContext.__vibePlayMongoRequestStorage ??
  (globalForContext.__vibePlayMongoRequestStorage =
    new AsyncLocalStorage<MongoRequestCache>());

export async function closeMongoRequestCache(
  cache: MongoRequestCache,
): Promise<void> {
  const pending = cache.clientPromise;

  const client =
    cache.client ??
    (pending ? await pending.catch(() => undefined) : undefined);

  cache.client = undefined;
  cache.clientPromise = undefined;
  cache.uri = undefined;

  if (client) {
    await client.close().catch(() => undefined);
  }
}