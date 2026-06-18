import { RateLimiter } from "./rateLimiter.js";

const DEFAULT_BASE_URL = "https://trustmrr.com/api/v1";

export class TrustMrrError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "TrustMrrError";
  }
}

export type QueryValue = string | number | boolean | undefined | null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** Parse a Retry-After / RateLimit-Reset header into milliseconds-from-now. */
function resetHeaderToMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isNaN(n)) {
    // Heuristic: a big number is an epoch timestamp, a small one is a delta.
    if (n > 1_000_000_000_000) return n - Date.now(); // epoch ms
    if (n > 1_000_000_000) return n * 1000 - Date.now(); // epoch seconds
    return n * 1000; // delta seconds
  }
  // HTTP-date form (used by some Retry-After responses)
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return date - Date.now();
  return undefined;
}

function backoffMs(retryAfter: string | null, reset: string | null, attempt: number): number {
  const fromRetryAfter = resetHeaderToMs(retryAfter);
  if (fromRetryAfter !== undefined && fromRetryAfter > 0) return clampBackoff(fromRetryAfter);
  const fromReset = resetHeaderToMs(reset);
  if (fromReset !== undefined && fromReset > 0) return clampBackoff(fromReset);
  // Exponential fallback with jitter.
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base + Math.floor(Math.random() * 500);
}

function clampBackoff(ms: number): number {
  return Math.min(60_000, Math.max(500, ms)) + Math.floor(Math.random() * 250);
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * Minimal typed HTTP client for the TrustMRR REST API.
 * - One shared token-bucket limiter keeps us under 20 req/min.
 * - 429s are retried with backoff driven by the rate-limit reset header.
 * - 401/404/400 surface as readable TrustMrrError instances (no stack spew, no key leakage).
 */
export class TrustMrrClient {
  private readonly limiter = new RateLimiter(18);
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl: string = process.env.TRUSTMRR_BASE_URL || DEFAULT_BASE_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }

    const maxRetries = 4;
    let attempt = 0;

    while (true) {
      await this.limiter.acquire();

      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
            "User-Agent": "trustmrr-mcp/0.1.0",
          },
        });
      } catch (err) {
        // Network-level failure — retry a couple of times, then surface cleanly.
        attempt++;
        if (attempt > maxRetries) {
          throw new TrustMrrError(0, `Network error reaching TrustMRR: ${(err as Error).message}`);
        }
        await sleep(clampBackoff(1000 * 2 ** attempt));
        continue;
      }

      const reset = res.headers.get("x-ratelimit-reset") ?? res.headers.get("ratelimit-reset");
      const remaining =
        res.headers.get("x-ratelimit-remaining") ?? res.headers.get("ratelimit-remaining");
      if (remaining !== null) this.limiter.observe(Number(remaining));

      if (res.status === 429) {
        attempt++;
        const retryAfter = res.headers.get("retry-after");
        const wait = backoffMs(retryAfter, reset, attempt);
        this.limiter.cooldown(wait);
        if (attempt > maxRetries) {
          throw new TrustMrrError(
            429,
            "TrustMRR rate limit hit (20 req/min) and still limited after backoff. Wait a moment and retry.",
          );
        }
        await sleep(wait);
        continue;
      }

      if (res.status === 401) {
        throw new TrustMrrError(
          401,
          "TrustMRR rejected the API key (401). Check your TrustMRR key — it must start with 'tmrr_' and be the current active key.",
        );
      }

      if (res.status === 400 || res.status === 404) {
        const body = await safeJson(res);
        const apiMsg =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : res.status === 404
              ? "Not found"
              : "Bad request";
        throw new TrustMrrError(res.status, apiMsg, body);
      }

      if (!res.ok) {
        const body = await safeJson(res);
        throw new TrustMrrError(res.status, `TrustMRR API error (HTTP ${res.status}).`, body);
      }

      return (await res.json()) as T;
    }
  }
}
