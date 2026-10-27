import { RequestHandler } from 'express';

// Per-process guard. For multiple replicas use a shared limiter at the ingress.
export function rateLimit(limit: number, windowMs: number, byUser = false): RequestHandler {
  const buckets = new Map<string, { count: number; expires: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key);
  }, Math.min(windowMs, 60000));
  sweep.unref();
  return (req, res, next) => {
    const key = (byUser ? req.user?.id : req.ip) ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      if (!bucket && buckets.size >= 10000) {
        res.status(429).json({ error: 'Too many requests', errorCode: 'RATE_LIMITED' });
        return;
      }
      bucket = { count: 0, expires: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.set('Retry-After', String(Math.ceil((bucket.expires - now) / 1000)));
      res.status(429).json({ error: 'Too many requests. Try again later.', errorCode: 'RATE_LIMITED' });
      return;
    }
    next();
  };
}
