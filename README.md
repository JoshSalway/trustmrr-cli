# trustmrr-cli + trustmrr-mcp

A private, local-first toolkit for asking natural-language questions about **verified startup revenue** from [TrustMRR](https://trustmrr.com) and getting synthesised answers.

The brain is **your own Claude subscription** (driven via the locally-installed `claude` CLI in print mode), so questions are billed to your Claude plan, not API credits. The data comes from the TrustMRR REST API, exposed as a standalone MCP server.

This is a pnpm monorepo with two packages:

| Package | What it is |
|---|---|
| [`packages/mcp`](packages/mcp) — **`trustmrr-mcp`** | A standalone stdio MCP server wrapping the TrustMRR REST API. Reusable anywhere an MCP client runs (Claude Code, Claude Desktop, Cursor). |
| [`packages/cli`](packages/cli) — **`trustmrr-cli`** | An interactive REPL that orchestrates `claude -p` with the MCP server attached, persists conversations locally, and pretty-prints answers. |

---

## Prerequisites

- **Node.js 20+** (tested on Node 24).
- **pnpm** (`npm i -g pnpm`).
- An **authenticated `claude` CLI** on your `PATH` — install [Claude Code](https://docs.claude.com/en/docs/claude-code) and sign in. The REPL shells out to it, so answers bill to your Claude subscription.
- A **TrustMRR API key** (starts with `tmrr_`). Get one at trustmrr.com → API keys.

## Install & build

```bash
pnpm install
pnpm build        # builds both packages (required before first run)
```

Optionally link the CLI globally so `trustmrr` is on your PATH:

```bash
cd packages/cli && pnpm link --global    # then run `trustmrr` anywhere
```

## Provide your TrustMRR API key

Key precedence is **`--api-key` flag > `TRUSTMRR_API_KEY` env > `~/.trustmrr-cli/config.json`**. Pick one:

```bash
# 1. Store it once in the local config (chmod 600, lives outside the repo):
node packages/cli/dist/index.js key tmrr_YOURKEY
#    …or from inside the REPL:  /key tmrr_YOURKEY

# 2. Or use an env var:
export TRUSTMRR_API_KEY=tmrr_YOURKEY

# 3. Or pass it per-invocation:
trustmrr --api-key tmrr_YOURKEY
```

The key is never written to the repo, to conversation logs, or to stdout. The generated MCP config that carries it lives at `~/.trustmrr-cli/mcp.json` (chmod 600).

## Usage

```bash
pnpm cli                      # start the interactive REPL
# or, if linked globally:
trustmrr
```

Example questions:

```
trustmrr ❯ Show me success stories of apps making between $1000 and $2000 per week — what are they and what do they do?
trustmrr ❯ Find SaaS apps growing fastest in the last 30 days and tell me their tech stacks.
trustmrr ❯ What mobile apps are on TrustMRR and how do they monetise?
trustmrr ❯ List the cheapest startups for sale under $10k with their multiples.
```

One-shot (non-interactive) mode:

```bash
trustmrr ask "What are the highest-revenue one-time-payment products on TrustMRR?"
```

### REPL commands

| Command | Description |
|---|---|
| `/help` | Show commands |
| `/new` | Start a fresh conversation (forgets prior context) |
| `/resume <id>` | Reopen a past conversation by session id |
| `/history` | List saved conversations |
| `/key [tmrr_…]` | Set or rotate your TrustMRR API key |
| `/quit` | Exit (also `/exit`, Ctrl-D) |

Plain text is treated as a question. Within a REPL session, follow-ups continue the same Claude session (via `--resume`), so *"of those, which has the best margin?"* answers from the prior turn's set.

## How it works

1. The REPL writes a `~/.trustmrr-cli/mcp.json` that launches `trustmrr-mcp` with your key injected into its environment.
2. For each question it invokes:
   ```
   claude -p "<question>" \
     --mcp-config ~/.trustmrr-cli/mcp.json --strict-mcp-config \
     --allowedTools "mcp__trustmrr__search_startups,mcp__trustmrr__get_startup,mcp__trustmrr__find_all_matching" \
     --append-system-prompt "<packages/cli/system-prompt.md>" \
     --output-format stream-json --verbose [--resume <session-id>]
   ```
3. It parses the `stream-json` event feed: tool calls render as dim status lines (`→ searching startups…`); the final answer is printed; the exchange is saved.

## Key conventions (baked into the MCP tools + system prompt)

- **All money is USD cents.** `42500` = $425.00.
- **Revenue filters operate on the LAST-30-DAYS figure.** A "$X per week" question converts as `cents = X * (30/7) * 100` (e.g. $1000–$2000/wk → `minRevenue=428571`, `maxRevenue=857143`).
- **MRR is a separate axis.** Many high-revenue listings are one-time-payment products with `mrr=0`.
- **`growth30d` and `minGrowth`/`maxGrowth` are decimals** (`0.12` = +12%). See the note in `packages/mcp/src/tools.ts`.
- **Listing bias:** revenue is processor-verified and real, but the dataset only contains founders who opted in — a curated showcase, not a representative sample. The system prompt always caveats generalisations.

Every startup returned by the tools includes a `derived` block (`weeklyRevenueUSD`, `monthlyRevenueUSD`, `totalRevenueUSD`, `mrrUSD`, `askingPriceUSD`) so weekly/monthly-framed questions map cleanly.

## Local persistence

```
~/.trustmrr-cli/
  config.json                 # { apiKey?, defaultEngine?, model? }  (chmod 600)
  mcp.json                    # generated MCP config with the key     (chmod 600)
  conversations/
    index.json                # sessionId -> { title, createdAt, updatedAt, turnCount, file }
    <timestamp>__<session-id>.jsonl   # one JSONL line per turn
```

Conversation transcripts are human-readable and greppable. `claude`'s own session store powers `--resume`; the JSONL is the durable, portable record.

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Run the CLI from source via tsx |
| `pnpm build` | Build both packages |
| `pnpm typecheck` | Type-check both packages |
| `pnpm cli` | Run the built CLI |
| `pnpm mcp` | Run the MCP server standalone (for debugging / MCP inspector) |
| `pnpm probe` | One-off live probe of the API (inspects headers + `growth30d` unit) |
| `pnpm lint` / `pnpm format` | Biome lint / format |

## Using `trustmrr-mcp` in other clients

The MCP server is independent of the CLI. To use it in Claude Desktop / Cursor / Claude Code, point an MCP config at the built server:

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

## License

Private. Not for distribution.
