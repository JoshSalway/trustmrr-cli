/**
 * Build-time probe. Makes ONE live call to GET /startups to:
 *   1. inspect the actual rate-limit header names/semantics, and
 *   2. resolve the ambiguous `growth30d` unit (docs say "24 = 24%", the example
 *      payload shows 0.12). We print real values so the unit is unambiguous.
 *
 * Run with:  TRUSTMRR_API_KEY=tmrr_... pnpm probe
 * It does a RAW fetch (bypassing the client) so we can see headers directly.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL = (process.env.TRUSTMRR_BASE_URL || "https://trustmrr.com/api/v1").replace(
  /\/+$/,
  "",
);

/** Resolve the key from env, falling back to ~/.trustmrr-cli/config.json (so the secret stays in the 600 file). */
function resolveKey(): string | undefined {
  const fromEnv = process.env.TRUSTMRR_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".trustmrr-cli", "config.json"), "utf8"),
    ) as { apiKey?: string };
    return cfg.apiKey?.trim();
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const key = resolveKey();
  if (!key) {
    console.error(
      "probe: no key found. Set TRUSTMRR_API_KEY or store it in ~/.trustmrr-cli/config.json.",
    );
    process.exit(1);
  }

  const url = `${BASE_URL}/startups?limit=5&sort=revenue-desc`;
  console.error(`probe: GET ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });

  console.error(`\n=== status: ${res.status} ${res.statusText} ===`);
  console.error("=== response headers ===");
  for (const [k, v] of res.headers.entries()) {
    // Surface everything; rate-limit headers are what we care about.
    console.error(`  ${k}: ${v}`);
  }

  if (!res.ok) {
    console.error("\nprobe: non-OK response body:");
    console.error(await res.text());
    process.exit(1);
  }

  const body = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
    meta?: Record<string, unknown>;
  };

  console.error("\n=== meta ===");
  console.error(JSON.stringify(body.meta, null, 2));

  console.error("\n=== growth30d / revenue samples (RESOLVE THE UNIT HERE) ===");
  for (const s of body.data ?? []) {
    console.error(
      JSON.stringify(
        {
          name: s.name,
          slug: s.slug,
          category: s.category,
          revenue: s.revenue,
          growth30d: s.growth30d,
          growthMRR30d: s.growthMRR30d,
          multiple: s.multiple,
          onSale: s.onSale,
          askingPrice: s.askingPrice,
        },
        null,
        2,
      ),
    );
  }

  console.error("\n=== full first row (all fields) ===");
  console.error(JSON.stringify(body.data?.[0], null, 2));
}

main().catch((err) => {
  console.error(`probe: error: ${(err as Error).message}`);
  process.exit(1);
});
