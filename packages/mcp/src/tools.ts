import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { enrich } from "./derive.js";
import type { TrustMrrClient } from "./http.js";
import { TrustMrrError } from "./http.js";
import { CATEGORIES, type ListResponse, SORTS, type StartupDetail } from "./types.js";

/**
 * Shared filter shape for GET /startups. MONEY INPUTS ARE USD CENTS.
 * Revenue filters operate on the LAST-30-DAYS figure (not weekly, not MRR).
 *
 * GROWTH UNIT (resolved by a live probe on 2026-06-18 — see scripts/probe.ts):
 *   The response fields `growth30d` / `growthMRR30d` are PLAIN PERCENTAGE NUMBERS,
 *   i.e. the value IS the percent. Proof: a real row had growth30d = -7.60, which
 *   is impossible as a ratio (a growth ratio floors at -1 = -100%), so -7.60 means
 *   -7.6%; another row had growth30d = 718.94 (= +718.9%). The docs' "24 = 24%" is
 *   correct; the brief's "0.12" example was misleading.
 *   The `minGrowth`/`maxGrowth` FILTERS use the SAME scale as the field (verified:
 *   minGrowth=0.5&maxGrowth=2 returns rows with growth30d in [0.5, 2]). So to filter
 *   "growing >10%" pass minGrowth=10 (NOT 0.1). Values can be huge for tiny-base
 *   startups (e.g. 187299 = +187,299%) — treat extreme growth as a low-base artifact.
 */
const filterShape = {
  sort: z
    .enum(SORTS)
    .optional()
    .describe(
      "Sort order. e.g. 'revenue-desc' (highest 30d revenue first), 'growth-desc' (fastest growing), 'price-asc' (cheapest asking price), 'best-deal'.",
    ),
  onSale: z
    .boolean()
    .optional()
    .describe(
      "Filter to listings that are for sale. Omit to include both for-sale and not-for-sale.",
    ),
  category: z
    .enum(CATEGORIES)
    .optional()
    .describe(`Category slug. One of: ${CATEGORIES.join(", ")}.`),
  xHandle: z.string().optional().describe("Founder's X (Twitter) handle, without the leading @."),
  minRevenue: z
    .number()
    .int()
    .optional()
    .describe(
      "Minimum LAST-30-DAYS revenue in USD CENTS (e.g. 428571 = $4,285.71/30d ≈ $1,000/week).",
    ),
  maxRevenue: z.number().int().optional().describe("Maximum LAST-30-DAYS revenue in USD CENTS."),
  minMrr: z
    .number()
    .int()
    .optional()
    .describe(
      "Minimum MRR in USD CENTS. MRR is recurring revenue only; one-time-payment products have mrr=0.",
    ),
  maxMrr: z.number().int().optional().describe("Maximum MRR in USD CENTS."),
  minGrowth: z
    .number()
    .optional()
    .describe(
      "Minimum 30-day revenue growth as a PERCENTAGE NUMBER (10 = +10%, -5 = -5%). Same scale as the growth30d field. Use minGrowth=10 for '>10% growth' (NOT 0.1).",
    ),
  maxGrowth: z
    .number()
    .optional()
    .describe("Maximum 30-day revenue growth as a PERCENTAGE NUMBER (10 = +10%)."),
  minPrice: z.number().int().optional().describe("Minimum asking price in USD CENTS."),
  maxPrice: z.number().int().optional().describe("Maximum asking price in USD CENTS."),
};

const searchShape = {
  page: z.number().int().min(1).optional().describe("Page number (default 1)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Results per page (default 10, max 50)."),
  ...filterShape,
};

type SearchArgs = {
  page?: number;
  limit?: number;
  sort?: (typeof SORTS)[number];
  onSale?: boolean;
  category?: (typeof CATEGORIES)[number];
  xHandle?: string;
  minRevenue?: number;
  maxRevenue?: number;
  minMrr?: number;
  maxMrr?: number;
  minGrowth?: number;
  maxGrowth?: number;
  minPrice?: number;
  maxPrice?: number;
};

/** Build the query object the API expects (onSale is a string "true"/"false"). */
function toQuery(args: SearchArgs) {
  return {
    page: args.page,
    limit: args.limit,
    sort: args.sort,
    onSale: args.onSale === undefined ? undefined : args.onSale ? "true" : "false",
    category: args.category,
    xHandle: args.xHandle,
    minRevenue: args.minRevenue,
    maxRevenue: args.maxRevenue,
    minMrr: args.minMrr,
    maxMrr: args.maxMrr,
    minGrowth: args.minGrowth,
    maxGrowth: args.maxGrowth,
    minPrice: args.minPrice,
    maxPrice: args.maxPrice,
  };
}

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(err: unknown) {
  const message =
    err instanceof TrustMrrError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Unknown error calling TrustMRR.";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export function registerTools(server: McpServer, client: TrustMrrClient): void {
  server.registerTool(
    "search_startups",
    {
      title: "Search TrustMRR startups",
      description:
        "List and filter Stripe/processor-verified startups from TrustMRR (GET /startups). " +
        "IMPORTANT CONVENTIONS: all money inputs are USD CENTS (42500 = $425.00); revenue filters " +
        "(minRevenue/maxRevenue) operate on the LAST-30-DAYS figure, not weekly and not MRR. To filter " +
        "by '$X per week', convert: cents = X * (30/7) * 100. MRR is a separate axis (minMrr/maxMrr); " +
        "many high-revenue listings are one-time-payment products with mrr=0. Each returned startup " +
        "includes a `derived` block with weeklyRevenueUSD, monthlyRevenueUSD, totalRevenueUSD, mrrUSD, " +
        "and askingPriceUSD for convenience. Returns { data, meta:{ total, page, limit, hasMore } }.",
      inputSchema: searchShape,
    },
    async (args) => {
      try {
        const res = await client.get<ListResponse>("/startups", toQuery(args as SearchArgs));
        const data = (res.data ?? []).map(enrich);
        return jsonResult({ data, meta: res.meta });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_startup",
    {
      title: "Get one TrustMRR startup",
      description:
        "Fetch full detail for a single startup by slug (GET /startups/{slug}). Returns everything in " +
        "the list shape PLUS the untruncated description, xFollowerCount, isMerchantOfRecord, techStack[] " +
        "{slug, category}, and cofounders[] {xHandle, xName}. Use after search_startups to pull rich detail " +
        "(full description + tech stack) on standout matches. Includes the same `derived` USD block.",
      inputSchema: { slug: z.string().min(1).describe("The startup slug, e.g. 'my-cool-app'.") },
    },
    async ({ slug }) => {
      try {
        // The detail endpoint wraps the startup under a `data` key
        // ({ data: {...} }), unlike list rows which are bare. Unwrap before enriching.
        const res = await client.get<{ data?: StartupDetail } | StartupDetail>(
          `/startups/${encodeURIComponent(slug)}`,
        );
        const startup =
          res && typeof res === "object" && "data" in res && res.data
            ? (res.data as StartupDetail)
            : (res as StartupDetail);
        return jsonResult(enrich(startup));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "find_all_matching",
    {
      title: "Find all matching startups (auto-paginate)",
      description:
        "Convenience tool for 'find every app that…' questions. Paginates GET /startups at limit=50 until " +
        "hasMore=false or maxResults is reached, throttled by the shared rate limiter. Same filters/conventions " +
        "as search_startups (money = USD CENTS, revenue = last-30-days). Returns { data, total, fetched, " +
        "truncated } where `truncated` is true if the maxResults cap stopped pagination early. Prefer this over " +
        "hand-rolling pagination, but keep maxResults modest to protect the 20 req/min budget.",
      inputSchema: {
        ...filterShape,
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Hard cap on results to fetch (default 150). Protects the rate-limit budget."),
      },
    },
    async (args) => {
      try {
        const a = args as SearchArgs & { maxResults?: number };
        const cap = a.maxResults ?? 150;
        const collected: ReturnType<typeof enrich>[] = [];
        let page = 1;
        let total = 0;
        let truncated = false;

        while (collected.length < cap) {
          const res = await client.get<ListResponse>(
            "/startups",
            toQuery({ ...a, page, limit: 50 }),
          );
          total = res.meta?.total ?? total;
          for (const item of res.data ?? []) {
            collected.push(enrich(item));
            if (collected.length >= cap) break;
          }
          if (!res.meta?.hasMore) break;
          if (collected.length >= cap) {
            truncated = true;
            break;
          }
          page += 1;
        }
        if (collected.length >= cap && total > collected.length) truncated = true;

        return jsonResult({ data: collected, total, fetched: collected.length, truncated });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
