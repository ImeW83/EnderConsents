import type { ConnectionOptions } from 'bullmq';

export function redisConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const url = new URL(raw);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ for its blocking connections
    maxRetriesPerRequest: null,
  };
}
