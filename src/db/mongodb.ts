import { MongoClient, type Db } from "mongodb";
import { HttpError } from "@/server/lib/http";
import { ensureMongoIndexes, getCollectionsFromDb, type VibePlayCollections } from "./collections";

/**
 * Reusable, cached MongoDB Atlas connection for Next.js + Netlify Functions.
 *
 * Uses `MONGODB_URI` and `MONGODB_DB_NAME` (defaults to "vibeplay").
 * The client promise is cached on `globalThis` so warm serverless containers
 * reuse the connection pool without exhausting Atlas M0 Free connection limits.
 */

export const DEFAULT_DB_NAME = "vibeplay";

export class DatabaseNotConfiguredError extends HttpError {
  constructor(
    message = "MongoDB is not configured. Set MONGODB_URI (and MONGODB_DB_NAME=vibeplay) in your environment variables.",
  ) {
    super(503, message);
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DB_NAME;
}

interface MongoGlobalCache {
  client: MongoClient | null;
  clientPromise: Promise<MongoClient> | null;
  uri: string | null;
  indexesPromise: Promise<void> | null;
}

const globalForMongo = globalThis as typeof globalThis & {
  __vibePlayMongoCache?: MongoGlobalCache;
};

function getCache(): MongoGlobalCache {
  if (!globalForMongo.__vibePlayMongoCache) {
    globalForMongo.__vibePlayMongoCache = {
      client: null,
      clientPromise: null,
      uri: null,
      indexesPromise: null,
    };
  }
  return globalForMongo.__vibePlayMongoCache;
}

async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new DatabaseNotConfiguredError();
  }

  const cache = getCache();
  // If URI changed at runtime (e.g. during tests), reset cleanly.
  if (cache.uri && cache.uri !== uri) {
    await closeMongoClient();
  }

  if (cache.clientPromise) {
    return cache.clientPromise;
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
    socketTimeoutMS: 20_000,
  });

  cache.uri = uri;
  cache.clientPromise = client
    .connect()
    .then((connected) => {
      cache.client = connected;
      return connected;
    })
    .catch(async (error) => {
      // Clear failed promise so future requests can retry once connectivity returns.
      cache.client = null;
      cache.clientPromise = null;
      cache.uri = null;
      cache.indexesPromise = null;
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

/** Returns the connected `vibeplay` database with indexes ensured once per cold start. */
export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  const cache = getCache();

  if (!cache.indexesPromise) {
    cache.indexesPromise = ensureMongoIndexes(db).catch((error) => {
      cache.indexesPromise = null;
      throw error;
    });
  }
  await cache.indexesPromise;
  return db;
}

/** Convenience accessor returning all typed VibePlay MongoDB collections. */
export async function getCollections(): Promise<VibePlayCollections> {
  const db = await getDb();
  return getCollectionsFromDb(db);
}

/** Health ping that never exposes URI credentials. */
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
    return { configured: true, connected: true, dbName };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      dbName,
      error: error instanceof Error ? error.message : "MongoDB ping failed.",
    };
  }
}

export async function closeMongoClient(): Promise<void> {
  const cache = getCache();
  const client = cache.client;
  cache.client = null;
  cache.clientPromise = null;
  cache.uri = null;
  cache.indexesPromise = null;
  if (client) {
    await client.close().catch(() => undefined);
  }
}
