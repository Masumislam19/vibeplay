import { MongoClient, type Db } from "mongodb";
import { HttpError } from "@/server/lib/http";
import {
  getCollectionsFromDb,
  type VibePlayCollections,
} from "./collections";
import {
  closeMongoRequestCache,
  mongoRequestStorage,
  type MongoRequestCache,
} from "./mongo-request-context";

export const DEFAULT_DB_NAME = "vibeplay";

type MongoGlobal = typeof globalThis & {
  __vibePlayNodeMongoCache?: MongoRequestCache;
  __VIBEPLAY_CLOUDFLARE_WORKER__?: boolean;
};

export class DatabaseNotConfiguredError extends HttpError {
  constructor(
    message = "MongoDB is not configured. Set MONGODB_URI and MONGODB_DB_NAME.",
  ) {
    super(503, message);
    this.name = "DatabaseNotConfiguredError";
  }
}

function getRuntimeGlobal(): MongoGlobal {
  return globalThis as MongoGlobal;
}

function isCloudflareWorker(): boolean {
  return getRuntimeGlobal().__VIBEPLAY_CLOUDFLARE_WORKER__ === true;
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DB_NAME;
}

function getNodeCache(): MongoRequestCache {
  const global = getRuntimeGlobal();

  if (!global.__vibePlayNodeMongoCache) {
    global.__vibePlayNodeMongoCache = {};
  }

  return global.__vibePlayNodeMongoCache;
}

async function getClientFromCache(
  cache: MongoRequestCache,
  uri: string,
): Promise<MongoClient> {
  if (cache.uri && cache.uri !== uri) {
    await closeMongoRequestCache(cache);
  }

  if (cache.clientPromise) {
    return cache.clientPromise;
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 1,
    minPoolSize: 0,
    maxIdleTimeMS: 20_000,
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
    socketTimeoutMS: 20_000,
  });

  cache.uri = uri;
  cache.client = client;

  cache.clientPromise = client.connect()
    .then(() => client)
    .catch(async (error) => {
      if (cache.client === client) {
        cache.client = undefined;
        cache.clientPromise = undefined;
        cache.uri = undefined;
      }

      await client.close().catch(() => undefined);

      console.error(
        "[vibeplay] MongoDB connection error:",
        error instanceof Error ? error.message : "unknown error",
      );

      throw new HttpError(
        503,
        "Could not connect to MongoDB Atlas. Verify MONGODB_URI and Atlas network access.",
      );
    });

  return cache.clientPromise;
}

async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new DatabaseNotConfiguredError();
  }

  const requestCache = mongoRequestStorage.getStore();

  if (requestCache) {
    return getClientFromCache(requestCache, uri);
  }

  // Never silently fall back to a shared MongoDB client on Cloudflare.
  if (isCloudflareWorker()) {
    throw new HttpError(
      500,
      "MongoDB request context is missing in the Cloudflare Worker.",
    );
  }

  // Standard Node.js hosting and local Next.js development.
  return getClientFromCache(getNodeCache(), uri);
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getMongoDbName());
}

export async function getCollections(): Promise<VibePlayCollections> {
  return getCollectionsFromDb(await getDb());
}

export async function pingMongo(): Promise<{
  configured: boolean;
  connected: boolean;
  dbName: string;
  error?: string;
}> {
  const dbName = getMongoDbName();

  if (!isMongoConfigured()) {
    return {
      configured: false,
      connected: false,
      dbName,
      error: "MONGODB_URI is not configured.",
    };
  }

  try {
    const client = await getMongoClient();

    await client.db(dbName).command({ ping: 1 });

    return {
      configured: true,
      connected: true,
      dbName,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      dbName,
      error: error instanceof Error
        ? error.message
        : "MongoDB ping failed.",
    };
  }
}

export async function closeMongoClient(): Promise<void> {
  const requestCache = mongoRequestStorage.getStore();

  if (requestCache) {
    await closeMongoRequestCache(requestCache);
    return;
  }

  if (!isCloudflareWorker()) {
    await closeMongoRequestCache(getNodeCache());
  }
}