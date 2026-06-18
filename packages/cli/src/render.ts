/** Tiny zero-dependency ANSI styling. Respects NO_COLOR and non-TTY output. */
const enabled = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (open: number, close: number) => (s: string) =>
  enabled ? `[${open}m${s}[${close}m` : s;

export const c = {
  dim: wrap(2, 22),
  bold: wrap(1, 22),
  italic: wrap(3, 23),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

/** Friendly, dim status line for a tool call (e.g. "→ searching startups…"). */
const TOOL_LABELS: Record<string, string> = {
  mcp__trustmrr__search_startups: "searching startups",
  mcp__trustmrr__get_startup: "fetching startup detail",
  mcp__trustmrr__find_all_matching: "scanning all matching startups",
};

export function toolStatusLine(name: string, input?: unknown): string {
  const label = TOOL_LABELS[name] ?? name.replace(/^mcp__trustmrr__/, "").replace(/_/g, " ");
  let hint = "";
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ["category", "sort", "slug", "onSale"]) {
      if (obj[k] !== undefined) parts.push(`${k}=${obj[k]}`);
    }
    if (obj.minRevenue !== undefined || obj.maxRevenue !== undefined) {
      parts.push(`revenue ${obj.minRevenue ?? "*"}..${obj.maxRevenue ?? "*"}¢`);
    }
    if (parts.length) hint = ` (${parts.join(", ")})`;
  }
  return c.dim(`  → ${label}${hint}…`);
}

export const banner = (s: string) => c.cyan(c.bold(s));
