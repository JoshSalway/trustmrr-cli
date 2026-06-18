import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TrustMrrClient } from "./http.js";
import { registerTools } from "./tools.js";

/**
 * Resolve the API key from TRUSTMRR_API_KEY, falling back to the CLI's config
 * file (~/.trustmrr-cli/config.json). The fallback lets this server be attached
 * to any MCP client (Claude Code/Desktop/Cursor) WITHOUT putting the key in the
 * MCP config — it reuses the one chmod-600 file. The key is never logged.
 */
function resolveApiKey(): string | undefined {
  const fromEnv = process.env.TRUSTMRR_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = readFileSync(join(homedir(), ".trustmrr-cli", "config.json"), "utf8");
    try {
      return (JSON.parse(raw) as { apiKey?: string }).apiKey?.trim();
    } catch {
      // Tolerate a bare-key file (key pasted directly, not as JSON).
      return raw.match(/tmrr_[A-Za-z0-9_-]+/)?.[0];
    }
  } catch {
    return undefined;
  }
}

/**
 * trustmrr-mcp — stdio MCP server wrapping the TrustMRR REST API.
 *
 * stdout is reserved for the MCP JSON-RPC stream, so every diagnostic goes to
 * stderr. The API key is never logged.
 */
async function main(): Promise<void> {
  const apiKey = resolveApiKey();

  if (!apiKey) {
    process.stderr.write(
      "trustmrr-mcp: no TrustMRR key found. Set TRUSTMRR_API_KEY (starts with 'tmrr_') or store it in ~/.trustmrr-cli/config.json.\n",
    );
    process.exit(1);
  }
  if (!apiKey.startsWith("tmrr_")) {
    process.stderr.write(
      "trustmrr-mcp: TRUSTMRR_API_KEY does not look like a TrustMRR key (expected it to start with 'tmrr_').\n",
    );
    process.exit(1);
  }

  const client = new TrustMrrClient(apiKey);
  const server = new McpServer({ name: "trustmrr", version: "0.1.0" });
  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("trustmrr-mcp: ready (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`trustmrr-mcp: fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
