# trustmrr-cli

> **Unofficial.** Independent, community-built tooling for TrustMRR data. Not affiliated with, endorsed by, or operated by TrustMRR. It calls the TrustMRR REST API with your own API key. TrustMRR publishes its own official MCP package as `trustmrr-mcp`; this project uses scoped package names to avoid confusion.

Ask natural-language questions about [TrustMRR](https://trustmrr.com) verified-revenue data from your terminal, using your existing Claude subscription. Or install only the local stdio MCP server and connect it to any MCP-capable client.

## Contents

- [Quick Start](#quick-start)
- [Why This Exists](#why-this-exists)
- [Open and Auditable](#open-and-auditable)
- [Packages](#packages)
- [Requirements](#requirements)
- [Key Handling](#key-handling)
- [CLI Usage](#cli-usage)
- [MCP Usage](#mcp-usage)
- [Native MCP Binary](#native-mcp-binary)
- [Binary Cost](#binary-cost)
- [Source Development](#source-development)
- [Data Conventions](#data-conventions)
- [Local Files](#local-files)

## Quick Start

### Claude CLI/REPL

```bash
npm install -g @joshsalway/trustmrr-cli
trustmrr key tmrr_YOURKEY
trustmrr
```

Then ask:

```text
trustmrr > Show me success stories of apps making between $1000 and $2000 per week.
trustmrr > Of those, which ones have the clearest acquisition angle?
```

One-shot mode:

```bash
trustmrr ask "What are the highest-revenue one-time-payment products on TrustMRR?"
```

### MCP-Only

Use this path for Claude Code, Cursor, Codex environments that support stdio MCP servers, or any other MCP-capable client where you want the agent to call TrustMRR tools directly.

```bash
npm install -g @joshsalway/trustmrr-mcp
```

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

This path does not use `claude -p`; your MCP client or agent handles the reasoning.

## Why This Exists

There are already TrustMRR MCP servers. This project is useful when you want a local, inspectable workflow rather than only raw hosted tools.

| Option | Best for | Tradeoff |
|---|---|---|
| Official/unscoped `trustmrr-mcp` | Canonical MCP package | MCP-only; no built-in Claude CLI conversation workflow |
| Remote HTTP MCP servers | Quick setup in MCP clients | Your bearer token is sent to a hosted third-party MCP service; auditability depends on the hosted implementation |
| Local stdio MCP servers | Keeping the TrustMRR key local | Answer synthesis and follow-up workflow still live in your client |
| `@joshsalway/trustmrr-cli` | Local Claude-powered TrustMRR research from the terminal | Requires local `claude` CLI and a TrustMRR API key |
| `@joshsalway/trustmrr-mcp` | Direct TrustMRR tools for Claude Code, Codex-capable MCP setups, Cursor, and other agents | MCP-only; no REPL, history, or Claude session resume |

## Open and Auditable

This project is designed to be easy to inspect before you trust it with an API key:

- the MCP server runs locally over stdio by default
- API keys are read from env or `~/.trustmrr-cli/config.json`
- generated MCP config is written outside the repo with file mode `0600`
- stdout is reserved for MCP JSON-RPC; diagnostics go to stderr
- request code, rate limiting, tool schemas, and derived revenue logic are in this repository
- npm packages include TypeScript `src/` files, not only compiled `dist/`
- offline tests exercise the MCP server against a mocked TrustMRR API, without a real key
- `TRUSTMRR_BASE_URL` is only for tests/development; if set to a non-TrustMRR host, the MCP server warns on stderr before sending requests

Inspect the MCP package before installing or running it:

```bash
npm pack --dry-run @joshsalway/trustmrr-mcp
npm pack @joshsalway/trustmrr-mcp
tar -tf joshsalway-trustmrr-mcp-*.tgz
```

## Packages

| Package | What it is |
|---|---|
| [`packages/cli`](packages/cli) / `@joshsalway/trustmrr-cli` | Interactive REPL that orchestrates `claude -p`, persists conversations locally, and pretty-prints tool calls. |
| [`packages/mcp`](packages/mcp) / `@joshsalway/trustmrr-mcp` | Standalone local stdio MCP server wrapping the TrustMRR REST API. |

## Requirements

For either package:

- Node.js 20+
- a TrustMRR API key that starts with `tmrr_`

For the `trustmrr` CLI/REPL:

- an authenticated `claude` CLI on your `PATH`

For source development:

- pnpm 10+

## Key Handling

Key precedence is:

1. `--api-key`
2. `TRUSTMRR_API_KEY`
3. `~/.trustmrr-cli/config.json`

Store a key for the CLI:

```bash
trustmrr key tmrr_YOURKEY
```

For source checkouts before global linking:

```bash
node packages/cli/dist/index.js key tmrr_YOURKEY
```

The key is never written to the repo, to conversation logs, or to stdout. The generated MCP config that carries it lives at `~/.trustmrr-cli/mcp.json` with mode `0600`.

## CLI Usage

```bash
trustmrr
trustmrr ask "Which SaaS listings under $25k look underpriced?"
```

Example questions:

```text
Show me success stories of apps making between $1000 and $2000 per week.
Find SaaS apps growing fastest in the last 30 days and tell me their tech stacks.
What mobile apps are on TrustMRR and how do they monetise?
List the cheapest startups for sale under $10k with their multiples.
```

REPL commands:

| Command | Description |
|---|---|
| `/help` | Show commands |
| `/new` | Start a fresh conversation |
| `/resume <id>` | Reopen a past conversation by session id |
| `/history` | List saved conversations |
| `/key [tmrr_...]` | Set or rotate your TrustMRR API key |
| `/quit` | Exit, also `/exit` or Ctrl-D |

Plain text is treated as a question. Follow-ups continue the same Claude session via `--resume`.

## MCP Usage

Install the MCP package:

```bash
npm install -g @joshsalway/trustmrr-mcp
```

Configure any stdio MCP client:

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

The MCP server exposes:

| Tool | Description |
|---|---|
| `search_startups` | List, filter, sort, and paginate startups. |
| `get_startup` | Fetch full detail for one startup by slug. |
| `find_all_matching` | Auto-paginate a filter until exhausted or capped. |

## Native MCP Binary

Users can run the MCP server from a single downloaded executable instead of installing Node/npm.

Download options:

- Use GitHub Release assets once published.
- Or run the manual **Build MCP Binaries** GitHub Actions workflow and download the uploaded artifact for your OS/CPU.

Expected artifact names:

```text
trustmrr-mcp-darwin-arm64
trustmrr-mcp-darwin-x64
trustmrr-mcp-linux-x64
trustmrr-mcp-win32-x64.exe
SHA256SUMS.txt
```

On macOS/Linux, make it executable:

```bash
chmod +x trustmrr-mcp-darwin-arm64
```

Use the downloaded binary in MCP config:

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

To build a binary locally for the current OS/CPU:

```bash
pnpm binary:mcp
```

The output is written to:

```text
packages/mcp/dist-bin/trustmrr-mcp-<platform>-<arch>
```

The binary is built with Node's single-executable application support. It bundles the MCP server and a Node runtime, so it is larger than the npm package but does not require Node to be installed on the target machine. The binary build is optional; the npm package remains the default install path.

## Binary Cost

Measured locally on macOS arm64:

```text
Binary size:   51 MB
Idle memory:   ~54 MB RSS
Idle CPU:      0.0%
```

For comparison, running `node packages/mcp/dist/index.js` on the same machine was about `65 MB` RSS at idle. Actual memory varies by OS, Node version, architecture, and MCP client. CPU should be effectively zero while idle; network/API calls briefly use CPU and are dominated by TrustMRR network latency.

## Source Development

```bash
pnpm install
pnpm build
pnpm verify
```

Run locally:

```bash
pnpm cli
pnpm mcp
```

For a source checkout MCP config, build first and point the client at `dist/index.js`:

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

Useful scripts:

| Script | Description |
|---|---|
| `pnpm verify` | Full release gate: build, typecheck, tests, lint, safety check, audit, package dry-run |
| `pnpm test` | Offline mocked MCP integration tests |
| `pnpm binary:mcp` | Build a current-platform native MCP executable |
| `pnpm probe` | One live TrustMRR API probe for headers/unit checks |
| `pnpm pack:dry-run` | Show package contents before publishing |
| `pnpm safety:check` | Enforce package manifest safety rules |

## Data Conventions

- Money fields are whole US dollars, not cents. `550024` means `$550,024`.
- Revenue filters operate on `revenue.last30Days`.
- Convert weekly revenue to a last-30-days filter with `dollars = weekly * (30 / 7)`.
- MRR is separate from last-30-days revenue. One-time-payment products can have `mrr=0`.
- `growth30d`, `growthMRR30d`, `minGrowth`, and `maxGrowth` are percentage numbers. Use `minGrowth=10` for `>10%`, not `0.1`.
- TrustMRR is an opt-in dataset. Treat it as a curated showcase, not a representative sample of all startups.

Every startup returned by the MCP tools includes a `derived` block with `weeklyRevenueUSD`, `monthlyRevenueUSD`, `totalRevenueUSD`, `mrrUSD`, and `askingPriceUSD`.

## Local Files

```text
~/.trustmrr-cli/
  config.json
  mcp.json
  conversations/
    index.json
    <timestamp>__<session-id>.jsonl
```

`config.json` and `mcp.json` are written with mode `0600` where the platform supports it. Conversation transcripts do not include the TrustMRR API key.

## License

[MIT](LICENSE). Unofficial; not affiliated with TrustMRR. You are responsible for using the TrustMRR API in accordance with TrustMRR's terms of service.
