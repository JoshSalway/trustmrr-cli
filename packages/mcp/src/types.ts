/** Allowed `category` values for GET /startups (exact slugs the API expects). */
export const CATEGORIES = [
  "ai",
  "saas",
  "developer-tools",
  "fintech",
  "marketing",
  "ecommerce",
  "productivity",
  "design-tools",
  "no-code",
  "analytics",
  "crypto-web3",
  "education",
  "health-fitness",
  "social-media",
  "content-creation",
  "sales",
  "customer-support",
  "recruiting",
  "real-estate",
  "travel",
  "legal",
  "security",
  "iot-hardware",
  "green-tech",
  "entertainment",
  "games",
  "community",
  "news-magazines",
  "utilities",
  "marketplace",
  "mobile-apps",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Allowed `sort` values for GET /startups. */
export const SORTS = [
  "revenue-desc",
  "revenue-asc",
  "price-desc",
  "price-asc",
  "multiple-asc",
  "multiple-desc",
  "growth-desc",
  "growth-asc",
  "listed-desc",
  "listed-asc",
  "best-deal",
] as const;

export type Sort = (typeof SORTS)[number];

export interface Revenue {
  last30Days: number | null; // USD (whole dollars, not cents)
  mrr: number | null; // USD (whole dollars, not cents)
  total: number | null; // USD (whole dollars, not cents)
}

/** Shape returned in GET /startups list rows. */
export interface StartupListItem {
  name: string;
  slug: string;
  icon?: string | null;
  description?: string | null; // truncated to <=200 chars in list responses
  website?: string | null;
  country?: string | null;
  foundedDate?: string | null;
  category?: string | null;
  paymentProvider?: string | null;
  targetAudience?: string | null;
  revenue?: Revenue | null;
  customers?: number | null;
  activeSubscriptions?: number | null;
  askingPrice?: number | null; // USD (whole dollars, not cents)
  profitMarginLast30Days?: number | null;
  growth30d?: number | null;
  growthMRR30d?: number | null;
  multiple?: number | null;
  rank?: number | null;
  visitorsLast30Days?: number | null;
  googleSearchImpressionsLast30Days?: number | null;
  revenuePerVisitor?: number | null;
  onSale?: boolean | null;
  firstListedForSaleAt?: string | null;
  xHandle?: string | null;
}

export interface TechStackEntry {
  slug: string;
  category: string;
}

export interface Cofounder {
  xHandle?: string | null;
  xName?: string | null;
}

/** Shape returned in GET /startups/{slug} (list shape plus detail-only fields). */
export interface StartupDetail extends StartupListItem {
  xFollowerCount?: number | null;
  isMerchantOfRecord?: boolean | null;
  techStack?: TechStackEntry[] | null;
  cofounders?: Cofounder[] | null;
}

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ListResponse {
  data: StartupListItem[];
  meta: ListMeta;
}

/** Derived USD figures we attach to every startup so weekly/monthly framing maps cleanly. */
export interface DerivedRevenue {
  /** last30Days converted to a per-week USD figure (last30Days * 7/30). */
  weeklyRevenueUSD: number | null;
  /** last30Days as a monthly USD figure (= last30Days; values are already dollars). */
  monthlyRevenueUSD: number | null;
  /** total lifetime revenue in USD (= revenue.total). */
  totalRevenueUSD: number | null;
  /** MRR in USD (= revenue.mrr). */
  mrrUSD: number | null;
  /** asking price in USD (= askingPrice), if listed for sale. */
  askingPriceUSD: number | null;
}

export type EnrichedStartup<T extends StartupListItem> = T & { derived: DerivedRevenue };
