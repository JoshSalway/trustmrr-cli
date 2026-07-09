# @joshsalway/trustmrr-cli

> **Unofficial.** Independent, community-built CLI for TrustMRR data. Not affiliated with, endorsed by, or operated by TrustMRR.

Local-first CLI/REPL for asking natural-language questions about TrustMRR verified-revenue data through your existing `claude` CLI subscription.

## Install

```bash
npm install -g @joshsalway/trustmrr-cli
trustmrr key tmrr_YOURKEY
trustmrr
```

Requires:

- Node.js 20+
- an authenticated `claude` CLI on your `PATH`
- a TrustMRR API key that starts with `tmrr_`

## What It Adds

- interactive follow-up workflow in your terminal
- Claude subscription billing through local `claude -p`
- local key storage in `~/.trustmrr-cli`
- derived weekly/monthly revenue fields
- auto-pagination for broad searches
- bundled local stdio MCP server

See the repository README for full setup, key handling, and usage:

https://github.com/JoshSalway/trustmrr-cli#readme
