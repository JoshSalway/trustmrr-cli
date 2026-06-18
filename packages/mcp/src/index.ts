import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TrustMrrClient } from "./http.js";
import { registerTools } from "./tools.js";

/**
 * trustmrr-mcp — stdio MCP server wrapping the TrustMRR REST API.
 *
 * stdout is reserved for the MCP JSON-RPC stream, so every diagnostic goes to
 * stderr. The API key is read from TRUSTMRR_API_KEY and is never logged.
 */
async function main(): Promise<void> {
  const apiKey = process.env.TRUSTMRR_API_KEY?.trim();

  if (!apiKey) {
    process.stderr.write(
      "trustmrr-mcp: TRUSTMRR_API_KEY is not set. Provide a TrustMRR key (starts with 'tmrr_') in the environment.\n",
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
