# @joshsalway/trustmrr-mcp

> **Unofficial.** Independent, community-built MCP server for TrustMRR data. Not affiliated with, endorsed by, or operated by TrustMRR. The official unscoped package is `trustmrr-mcp`; this package uses a scoped name to avoid confusion.

Local stdio [MCP](https://modelcontextprotocol.io) server for the TrustMRR REST API. It can be used directly by MCP clients or as the tool server behind `@joshsalway/trustmrr-cli`.

## Install

```bash
npm install -g @joshsalway/trustmrr-mcp
```

Requires a TrustMRR API key that starts with `tmrr_`.

## MCP Config

```json
{
  "mcpServers": {
    "trustmrr": {
      "command": "trustmrr-mcp",
      "env": {
        "TRUSTMRR_API_KEY": "tmrr_YOURKEY"
      }
    }
  }
}
```

The server can also read the key from `~/.trustmrr-cli/config.json`, which is created by the CLI.

## Tools

| Tool | Description |
|---|---|
| `search_startups` | List, filter, sort, and paginate startups. |
| `get_startup` | Fetch full detail for one startup by slug. |
| `find_all_matching` | Auto-paginate a filter until exhausted or `maxResults` is reached. |

Every result includes a `derived` block with `weeklyRevenueUSD`, `monthlyRevenueUSD`, `totalRevenueUSD`, `mrrUSD`, and `askingPriceUSD`.

## Data Conventions

- Money values are whole US dollars, not cents.
- Revenue filters operate on `revenue.last30Days`.
- Convert weekly revenue to last-30-days revenue with `dollars = weekly * (30 / 7)`.
- MRR is separate from last-30-days revenue.
- Growth values and growth filters are percentage numbers. Use `10` for `+10%`, not `0.1`.

## Open and Auditable

This package is designed to be inspectable before you trust it with an API key:

- local stdio transport by default
- no hosted proxy between your MCP client and TrustMRR
- diagnostics go to stderr, never stdout
- TypeScript `src/` and offline integration tests are included in the npm package
- tests run against a mocked TrustMRR API and do not require a real key

Inspect the package:

```bash
npm pack --dry-run @joshsalway/trustmrr-mcp
npm pack @joshsalway/trustmrr-mcp
tar -tf joshsalway-trustmrr-mcp-*.tgz
```

## Native Binary

Users can run this MCP server from a single downloaded executable instead of installing Node/npm.

Download options:

- GitHub Release assets, once published.
- Manual **Build MCP Binaries** GitHub Actions workflow artifacts.

Expected artifact names:

```text
trustmrr-mcp-darwin-arm64
trustmrr-mcp-darwin-x64
trustmrr-mcp-linux-x64
trustmrr-mcp-win32-x64.exe
SHA256SUMS.txt
```

On macOS/Linux:

```bash
chmod +x trustmrr-mcp-darwin-arm64
```

MCP config:

```json
{
  "mcpServers": {
    "trustmrr": {
      "command": "/absolute/path/to/trustmrr-mcp-darwin-arm64",
      "env": {
        "TRUSTMRR_API_KEY": "tmrr_YOURKEY"
      }
    }
  }
}
```

Measured locally on macOS arm64:

```text
Binary size:   51 MB
Idle memory:   ~54 MB RSS
Idle CPU:      0.0%
```

Actual memory varies by OS and architecture. The binary bundles Node, so it is larger than the npm package but does not require Node to be installed on the target machine.

Build a current-platform binary locally:

```bash
pnpm install
pnpm binary:mcp
```

Output:

```text
packages/mcp/dist-bin/trustmrr-mcp-<platform>-<arch>
```

## Source Checkout

```bash
pnpm install
pnpm build
pnpm --filter @joshsalway/trustmrr-mcp test
```

Point an MCP client at the built entry:

```json
{
  "mcpServers": {
    "trustmrr": {
      "command": "node",
      "args": ["/absolute/path/to/trustmrr-cli/packages/mcp/dist/index.js"],
      "env": {
        "TRUSTMRR_API_KEY": "tmrr_YOURKEY"
      }
    }
  }
}
```

## Development Override

`TRUSTMRR_BASE_URL` can override the API base URL for tests and local development. Do not set it in normal use. If it points to a host other than `trustmrr.com`, the server warns on stderr because the TrustMRR API key will be sent to that host.

## License

[MIT](../../LICENSE). Unofficial; not affiliated with TrustMRR.
