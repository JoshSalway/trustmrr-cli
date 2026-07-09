import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const startup = {
  name: "Mock Startup",
  slug: "mock-startup",
  description: "A mocked TrustMRR startup.",
  website: "https://example.com",
  country: "US",
  foundedDate: "2024-01-01T00:00:00.000Z",
  category: "SaaS",
  paymentProvider: "stripe",
  targetAudience: "founders",
  revenue: {
    last30Days: 3000,
    mrr: 1000,
    total: 12000,
  },
  customers: 42,
  activeSubscriptions: 12,
  askingPrice: 9000,
  profitMarginLast30Days: 0.75,
  growth30d: 12.5,
  growthMRR30d: 10,
  multiple: 3,
  rank: 1,
  visitorsLast30Days: 5000,
  googleSearchImpressionsLast30Days: 2500,
  revenuePerVisitor: 0.6,
  onSale: true,
  firstListedForSaleAt: "2026-01-01T00:00:00.000Z",
  xHandle: "mockfounder",
};

function sendJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {
    "content-type": "application/json",
    "x-ratelimit-limit": "20",
    "x-ratelimit-remaining": "19",
    "x-ratelimit-reset": String(Date.now() + 60_000),
  });
  res.end(JSON.stringify(body));
}

function sendRateLimit(res: ServerResponse): void {
  res.writeHead(429, {
    "content-type": "application/json",
    "retry-after": "0",
    "x-ratelimit-limit": "20",
    "x-ratelimit-remaining": "0",
    "x-ratelimit-reset": String(Date.now() + 500),
  });
  res.end(JSON.stringify({ error: "Rate limited" }));
}

async function startMockApi() {
  const requests: string[] = [];
  const counts = new Map<string, number>();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const requestKey = `${req.method} ${url.pathname}${url.search}`;
    requests.push(requestKey);
    counts.set(url.pathname, (counts.get(url.pathname) ?? 0) + 1);

    if (req.headers.authorization !== "Bearer tmrr_test_key") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (url.pathname === "/startups") {
      sendJson(res, {
        data: [startup],
        meta: {
          total: 1,
          page: Number(url.searchParams.get("page") ?? "1"),
          limit: Number(url.searchParams.get("limit") ?? "10"),
          hasMore: false,
        },
      });
      return;
    }

    if (url.pathname === "/startups/malformed-json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not-json");
      return;
    }

    if (url.pathname === "/startups/mock-startup") {
      sendJson(res, {
        data: {
          ...startup,
          description: "The full mocked startup description.",
          xFollowerCount: 1234,
          isMerchantOfRecord: false,
          techStack: [{ slug: "typescript", category: "language" }],
          cofounders: [{ xHandle: "cofounder", xName: "Co Founder" }],
        },
      });
      return;
    }

    if (url.pathname === "/startups/malformed-detail") {
      sendJson(res, { data: null });
      return;
    }

    if (url.pathname === "/startups/rate-limited") {
      if ((counts.get(url.pathname) ?? 0) === 1) {
        sendRateLimit(res);
        return;
      }
      sendJson(res, {
        data: {
          ...startup,
          slug: "rate-limited",
        },
      });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

type EntryPoint = "source" | "dist";

async function startMcpClient(
  apiBaseUrl: string,
  entryPoint: EntryPoint,
  apiKey = "tmrr_test_key",
) {
  const transport = new StdioClientTransport({
    command: entryPoint === "source" ? "pnpm" : "./dist/index.js",
    args: entryPoint === "source" ? ["exec", "tsx", "src/index.ts"] : [],
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRUSTMRR_API_KEY: apiKey,
      TRUSTMRR_BASE_URL: apiBaseUrl,
    },
  });
  const client = new Client({ name: "trustmrr-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function exerciseHappyPath(entryPoint: EntryPoint) {
  const api = await startMockApi();
  const client = await startMcpClient(api.baseUrl, entryPoint);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "find_all_matching",
      "get_startup",
      "search_startups",
    ]);

    const search = await client.callTool({
      name: "search_startups",
      arguments: { limit: 1, sort: "revenue-desc" },
    });
    assert.equal(search.isError, undefined);
    const searchBody = JSON.parse(search.content[0]?.text as string);
    assert.equal(searchBody.data[0].slug, "mock-startup");
    assert.equal(searchBody.data[0].derived.weeklyRevenueUSD, 700);
    assert.equal(searchBody.meta.total, 1);

    const detail = await client.callTool({
      name: "get_startup",
      arguments: { slug: "mock-startup" },
    });
    assert.equal(detail.isError, undefined);
    const detailBody = JSON.parse(detail.content[0]?.text as string);
    assert.equal(detailBody.description, "The full mocked startup description.");
    assert.equal(detailBody.techStack[0].slug, "typescript");
    assert.equal(detailBody.derived.monthlyRevenueUSD, 3000);

    const all = await client.callTool({
      name: "find_all_matching",
      arguments: { maxResults: 10, onSale: true },
    });
    assert.equal(all.isError, undefined);
    const allBody = JSON.parse(all.content[0]?.text as string);
    assert.equal(allBody.fetched, 1);
    assert.equal(allBody.truncated, false);

    assert(api.requests.some((request) => request.includes("/startups?limit=1")));
    assert(api.requests.includes("GET /startups/mock-startup"));
  } finally {
    await client.close();
    await api.close();
  }
}

test("source stdio MCP server exposes and executes TrustMRR tools", async () => {
  await exerciseHappyPath("source");
});

test("built stdio MCP server exposes and executes TrustMRR tools", async () => {
  await exerciseHappyPath("dist");
});

test("MCP tools return readable errors for TrustMRR API failures", async () => {
  const api = await startMockApi();
  const client = await startMcpClient(api.baseUrl, "dist");
  try {
    const missing = await client.callTool({
      name: "get_startup",
      arguments: { slug: "missing-startup" },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0]?.text as string, /Not found/);

    const malformedDetail = await client.callTool({
      name: "get_startup",
      arguments: { slug: "malformed-detail" },
    });
    assert.equal(malformedDetail.isError, true);
    assert.match(malformedDetail.content[0]?.text as string, /unexpected startup detail/i);

    const malformedJson = await client.callTool({
      name: "get_startup",
      arguments: { slug: "malformed-json" },
    });
    assert.equal(malformedJson.isError, true);
    assert.match(malformedJson.content[0]?.text as string, /json|unexpected/i);

    const rateLimited = await client.callTool({
      name: "get_startup",
      arguments: { slug: "rate-limited" },
    });
    assert.equal(rateLimited.isError, undefined);
    const rateLimitedBody = JSON.parse(rateLimited.content[0]?.text as string);
    assert.equal(rateLimitedBody.slug, "rate-limited");
    assert.equal(
      api.requests.filter((request) => request.startsWith("GET /startups/rate-limited")).length,
      2,
    );
  } finally {
    await client.close();
    await api.close();
  }
});

test("MCP tools return readable errors for rejected API keys", async () => {
  const api = await startMockApi();
  const client = await startMcpClient(api.baseUrl, "dist", "tmrr_rejected_key");
  try {
    const res = await client.callTool({
      name: "search_startups",
      arguments: { limit: 1 },
    });
    assert.equal(res.isError, true);
    assert.match(res.content[0]?.text as string, /rejected the API key|401/i);
  } finally {
    await client.close();
    await api.close();
  }
});

test("built MCP server exits cleanly when no API key is configured", async () => {
  const home = mkdtempSync(join(tmpdir(), "trustmrr-mcp-no-key-"));
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  const [code] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
  assert.equal(code, 1);
  assert.match(Buffer.concat(stderr).toString("utf8"), /no TrustMRR key found/);
});
