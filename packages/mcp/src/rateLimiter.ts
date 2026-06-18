/**
 * Single in-flight token-bucket rate limiter.
 *
 * TrustMRR allows 20 requests/minute per key. We run at a deliberately lower
 * ceiling (default 18/min) to keep headroom for clock skew and bursts, and to
 * avoid ever tripping the 429 in normal operation. All HTTP calls funnel through
 * one shared limiter instance so concurrent MCP tool calls can't blow the budget.
 */
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefill: number;
  private cooldownUntil = 0;
  private readonly waiters: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(maxPerMinute = 18) {
    this.capacity = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillPerMs = maxPerMinute / 60_000;
    this.lastRefill = Date.now();
  }

  /** Resolve once a request token is available (respecting any active cooldown). */
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.pump();
    });
  }

  /**
   * Called after a 429 (or a near-empty rate-limit header): drain the bucket and
   * refuse to issue further requests until `ms` from now have elapsed.
   */
  cooldown(ms: number): void {
    const until = Date.now() + Math.max(0, ms);
    if (until > this.cooldownUntil) this.cooldownUntil = until;
    this.tokens = 0;
    this.pump();
  }

  /** Feed back the server's reported remaining quota to stay conservative. */
  observe(remaining: number | undefined): void {
    if (remaining === undefined || Number.isNaN(remaining)) return;
    // Never hold more tokens than the server says we have left this window.
    if (remaining < this.tokens) this.tokens = Math.max(0, remaining);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
      this.lastRefill = now;
    }
  }

  private pump(): void {
    this.refill();
    const now = Date.now();
    const cooling = now < this.cooldownUntil;

    if (!cooling) {
      while (this.waiters.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        const resolve = this.waiters.shift();
        resolve?.();
      }
    }

    if (this.waiters.length > 0 && !this.timer) {
      let waitMs: number;
      if (cooling) {
        waitMs = this.cooldownUntil - now;
      } else {
        const needed = 1 - this.tokens;
        waitMs = Math.ceil(needed / this.refillPerMs);
      }
      this.timer = setTimeout(
        () => {
          this.timer = null;
          this.pump();
        },
        Math.max(25, waitMs),
      );
      // Don't keep the event loop alive purely for the limiter.
      if (typeof this.timer === "object" && "unref" in this.timer) this.timer.unref();
    }
  }
}
