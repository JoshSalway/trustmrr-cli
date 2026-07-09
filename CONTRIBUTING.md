# Contributing

This is an unofficial TrustMRR client and MCP server. Keep that distinction clear in code, docs, package metadata, and user-facing messages.

## Setup

```bash
pnpm install
pnpm build
```

Requires Node.js 20+ and pnpm 10+.

## Verification

Run the full local release gate before opening a pull request:

```bash
pnpm verify
```

This runs build, typecheck, offline tests, lint, package safety checks, dependency audit, and package dry-runs.

Useful focused checks:

```bash
pnpm test
pnpm lint
pnpm safety:check
pnpm pack:dry-run
```

`pnpm test` is offline. It starts a mocked TrustMRR API and exercises the stdio MCP server through the MCP SDK, including the built executable.

`pnpm probe` is the only script intended to call the live TrustMRR API. Use it sparingly and only with your own API key.

## Secrets and Data

Never commit:

- real API keys
- generated MCP configs
- conversation logs
- Claude session data
- private TrustMRR/customer data

Use placeholders such as `tmrr_YOURKEY` or `tmrr_test_key` in examples and tests.

## Scope

Keep changes focused. The MCP package must stay usable independently of the CLI, and the CLI should continue to resolve the MCP server through its package dependency so linked/global installs work.
