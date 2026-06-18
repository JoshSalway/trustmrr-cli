import type { DerivedRevenue, EnrichedStartup, StartupListItem } from "./types.js";

/** Round a USD figure to 2dp, preserving null. */
function usd(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Compute the derived USD figures for a startup.
 *
 * IMPORTANT: TrustMRR's monetary fields are in WHOLE US DOLLARS, not cents.
 * Verified against trustmrr.com (2026-06-18): the site renders the raw
 * `revenue.last30Days` integer directly as dollars — e.g. `550024` is shown as
 * "$550,024/month", NOT "$5,500.24". (An earlier build assumed cents and was
 * wrong by 100x.) So:
 *   monthlyRevenueUSD = last30Days
 *   weeklyRevenueUSD  = last30Days * (7 / 30)
 * (the 7/30 factor is the inverse of the 30/7 conversion used when turning a
 * "$X per week" question into a last-30-days dollar filter.)
 */
export function deriveRevenue(s: StartupListItem): DerivedRevenue {
  const last30 = s.revenue?.last30Days ?? null;
  return {
    weeklyRevenueUSD: last30 === null ? null : Math.round(last30 * (7 / 30) * 100) / 100,
    monthlyRevenueUSD: usd(last30),
    totalRevenueUSD: usd(s.revenue?.total ?? null),
    mrrUSD: usd(s.revenue?.mrr ?? null),
    askingPriceUSD: usd(s.askingPrice ?? null),
  };
}

/** Attach a `derived` block to a startup while keeping all raw fields intact. */
export function enrich<T extends StartupListItem>(s: T): EnrichedStartup<T> {
  return { ...s, derived: deriveRevenue(s) };
}
