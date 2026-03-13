/**
 * Redis client using ioredis
 * In production, connect to Redis cluster (Elasticache, Upstash, etc.)
 * For local dev, use Docker: docker run -p 6379:6379 redis
 */

import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true,
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});

// Lazy connect on first use
let connected = false;
async function ensureConnection() {
  if (!connected) {
    try {
      await redis.connect();
      connected = true;
      console.log("✓ Redis connected");
    } catch (err) {
      console.error("✗ Redis connection failed:", err.message);
      throw err;
    }
  }
}

export { redis, ensureConnection };
