import "server-only";

/**
 * Best-effort fixed-window rate limit, per key, in process memory.
 *
 * Not durable and not shared between serverless instances: it slows a single client
 * hammering one instance, nothing more. Production would use a shared store
 * (e.g. Upstash Redis or Vercel's firewall rules).
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns seconds to wait, or 0 when the request is allowed. */
  check(key: string): number {
    const now = this.now();
    if (this.hits.size > 5_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
