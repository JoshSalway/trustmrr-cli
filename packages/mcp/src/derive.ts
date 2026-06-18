import type { DerivedRevenue, EnrichedStartup, StartupListItem } from "./types.js";

/** Round to cents (2dp) for human-facing USD, preserving null. */
function usd(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  return Math.round((cents / 100) * 100) / 100;
}

/**
 * Compute the derived USD figures for a startup.
 *
 * Revenue filters/fields on TrustMRR are the LAST-30-DAYS number in cents, so:
 *   monthlyRevenueUSD = last30Days / 100
 *   weeklyRevenueUSD  = last30Days / 100 * (7 / 30)
 * (the 7/30 factor is the inverse of the 30/7 conversion used when turning a
 * "$X per week" question into a last-30-days cents filter.)
 */
export function deriveRevenue(s: StartupListItem): DerivedRevenue {
  const last30 = s.revenue?.last30Days ?? null;
  const monthlyRevenueUSD = usd(last30);
  const weeklyRevenueUSD =
    last30 === null ? null : Math.round((last30 / 100) * (7 / 30) * 100) / 100;
  return {
    weeklyRevenueUSD,
    monthlyRevenueUSD,
    totalRevenueUSD: usd(s.revenue?.total ?? null),
    mrrUSD: usd(s.revenue?.mrr ?? null),
    askingPriceUSD: usd(s.askingPrice ?? null),
  };
}

/** Attach a `derived` block to a startup while keeping all raw cents fields intact. */
export function enrich<T extends StartupListItem>(s: T): EnrichedStartup<T> {
  return { ...s, derived: deriveRevenue(s) };
}
