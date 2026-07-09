import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONFIG_DIR, ensureDirs } from "./config.js";

const require = createRequire(import.meta.url);

/** MCP tool names the inner Claude is allowed to call. */
export const ALLOWED_TOOLS = [
  "mcp__trustmrr__search_startups",
  "mcp__trustmrr__get_startup",
  "mcp__trustmrr__find_all_matching",
];

/**
 * Locate the built trustmrr-mcp server entry (dist/index.js). Resolved via the
 * workspace dependency so it works whether linked globally or run from source.
 */
export function resolveMcpServerEntry(): string {
  // Prefer the package main (dist/index.js). Falls back to walking from the pkg dir.
  try {
    const entry = require.resolve("@joshsalway/trustmrr-mcp");
    if (existsSync(entry)) return entry;
  } catch {
    /* fall through to manual resolution */
  }
  try {
    const pkgJson = require.resolve("@joshsalway/trustmrr-mcp/package.json");
    const candidate = join(dirname(pkgJson), "dist", "index.js");
    if (existsSync(candidate)) return candidate;
  } catch {
    /* fall through */
  }
  throw new Error(
    "Could not find the built trustmrr-mcp server. Run `pnpm build` in the monorepo first.",
  );
}

export interface GeneratedMcpConfig {
  path: string;
  serverEntry: string;
}

/**
 * Write a fresh .mcp.json into ~/.trustmrr-cli (outside the repo, chmod 600) that
 * launches trustmrr-mcp with the API key injected into its environment. The key
 * lives only in this user-only file, never in the repo or in logs.
 */
export function generateMcpConfig(apiKey: string): GeneratedMcpConfig {
  ensureDirs();
  const serverEntry = resolveMcpServerEntry();
  const config = {
    mcpServers: {
      trustmrr: {
        command: process.execPath, // the current node binary
        args: [serverEntry],
        env: {
          TRUSTMRR_API_KEY: apiKey,
          ...(process.env.TRUSTMRR_BASE_URL
            ? { TRUSTMRR_BASE_URL: process.env.TRUSTMRR_BASE_URL }
            : {}),
        },
      },
    },
  };
  const path = join(CONFIG_DIR, "mcp.json");
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return { path, serverEntry };
}
