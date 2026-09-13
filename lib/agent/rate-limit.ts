import { U_AGENT_RATE_LIMIT_MAX, U_AGENT_RATE_LIMIT_WINDOW_MS } from '@/lib/agent/config';

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

/** Simple in-memory rate limiter (per-instance). Good enough for v1. */
export function checkAgentRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < U_AGENT_RATE_LIMIT_WINDOW_MS);
  if (bucket.timestamps.length >= U_AGENT_RATE_LIMIT_MAX) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, U_AGENT_RATE_LIMIT_WINDOW_MS - (now - oldest)),
    };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: U_AGENT_RATE_LIMIT_MAX - bucket.timestamps.length,
    retryAfterMs: 0,
  };
}
