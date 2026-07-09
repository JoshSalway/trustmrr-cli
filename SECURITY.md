# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes are handled on `main` until a stable release line exists.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security advisory for this repository. If advisories are unavailable, contact the maintainer directly before publishing details.

Do not include real TrustMRR API keys, Claude session data, private startup data, or customer data in public issues, discussions, pull requests, logs, or screenshots.

## Secret Handling

TrustMRR API keys should stay outside the repository:

- `TRUSTMRR_API_KEY` can be provided as an environment variable.
- The CLI stores keys in `~/.trustmrr-cli/config.json` with mode `0600` where supported.
- Generated MCP config lives at `~/.trustmrr-cli/mcp.json` with mode `0600` where supported.
- Conversation transcripts do not include the TrustMRR API key.

The offline test suite uses a mocked key and mocked API server. It does not require a real TrustMRR API key.

## Supply Chain Controls

This project cannot prove a package is malware-free in the absolute sense, but releases are designed to be inspectable and hard to tamper with:

- publishable packages include `src/` and `README.md`, not only compiled `dist/`
- CI runs build, typecheck, tests, lint, dependency audit, package safety checks, and package dry-runs
- publishable packages must not define npm install-time lifecycle scripts: `preinstall`, `install`, `postinstall`, or `prepare`
- `prepack` is allowed only to rebuild `dist/` before packaging
- dependency audit fails on low-or-higher severity advisories
- the lockfile is committed and CI installs with `pnpm install --frozen-lockfile`

Inspect a release tarball before running it:

```bash
npm pack --dry-run @joshsalway/trustmrr-mcp
npm pack @joshsalway/trustmrr-mcp
tar -tf joshsalway-trustmrr-mcp-*.tgz
```

Recommended publishing path: GitHub Actions with npm provenance enabled, so npm can link the published package back to the exact repository workflow run.
