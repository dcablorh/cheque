import Redis from 'ioredis';

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private redis?: Redis;
  private memory = new Map<string, Bucket>();

  constructor(redisUrl?: string) {
    if (redisUrl) {
      const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      client.connect().catch(() => {
        this.redis = undefined;
      });
      this.redis = client;
    }
  }

  async check(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        const current = await this.redis.incr(key);
        if (current === 1) await this.redis.expire(key, windowSeconds);
        if (current > limit) {
          const ttl = await this.redis.ttl(key);
          return { allowed: false, retryAfter: Math.max(1, ttl) };
        }
        return { allowed: true, retryAfter: 0 };
      } catch {
        // fall through to memory
      }
    }

    const now = Date.now();
    const bucket = this.memory.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, retryAfter: 0 };
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  }
}
