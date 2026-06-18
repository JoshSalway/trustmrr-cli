# trustmrr-mcp

> **Unofficial.** Independent, community-built MCP server. Not affiliated with, endorsed by, or operated by TrustMRR. It calls the public TrustMRR REST API with **your own** API key. TrustMRR publishes its own official server (`trustmrr-mcp` on npm / [`AiToolsforStartups/trustmrr-mcp`](https://github.com/AiToolsforStartups/trustmrr-mcp)).

A standalone stdio [MCP](https://modelcontextprotocol.io) server wrapping the [TrustMRR](https://trustmrr.com) verified-revenue REST API. Part of the [trustmrr-cli](https://github.com/JoshSalway/trustmrr-cli) monorepo.

## Tools

| Tool | Description |
|---|---|
| `search_startups` | List + filter + sort + paginate startups (`GET /startups`). |
| `get_startup` | Full detail for one startup by slug (tech stack, cofounders, untruncated description). |
| `find_all_matching` | Auto-paginate a filter until exhausted or a `maxResults` cap. |

Every result is enriched with a `derived` block: `weeklyRevenueUSD`, `monthlyRevenueUSD`, `totalRevenueUSD`, `mrrUSD`, `askingPriceUSD`.

## Conventions (important)

- **All money is in WHOLE US DOLLARS, not cents.** `last30Days=550024` means $550,024 (verified against trustmrr.com).
- **Revenue filters operate on the LAST-30-DAYS figure.** Convert a weekly figure with `dollars = $/week * (30/7)` (e.g. $1,000/wk → `minRevenue=4286`).
- **MRR is a separate axis** (`minMrr`/`maxMrr`); one-time-payment products have `mrr=0`.
- **`growth30d` and `minGrowth`/`maxGrowth` are percentage numbers** (`24` = +24%, not `0.24`).

## Usage

Requires `TRUSTMRR_API_KEY` (a key starting with `tmrr_`) in the environment; it also falls back to `~/.trustmrr-cli/config.json`. The key is never logged.

```json
{
  "mcpServers": {
    "trustmrr": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": { "TRUSTMRR_API_KEY": "tmrr_YOURKEY" }
    }
  }
}
```

Rate-limited to stay under the API's 20 req/min (token bucket + `429` backoff via the rate-limit reset header).

## License

[MIT](../../LICENSE) © Josh Salway.
