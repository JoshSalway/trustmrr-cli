import { Command } from "commander";
import { runClaude } from "./claude.js";
import { ensureDirs, looksLikeKey, resolveApiKey, setApiKey } from "./config.js";
import { generateMcpConfig } from "./mcpConfig.js";
import { recordExchange } from "./persistence.js";
import { c, toolStatusLine } from "./render.js";
import { startRepl } from "./repl.js";
import { loadSystemPrompt } from "./systemPrompt.js";

interface GlobalOpts {
  apiKey?: string;
  model?: string;
  engine?: string;
}

function requireKey(flagKey?: string): string {
  const key = resolveApiKey(flagKey);
  if (!looksLikeKey(key)) {
    console.error(
      c.red(
        "No TrustMRR API key found. Provide one with --api-key tmrr_…, the TRUSTMRR_API_KEY env var, or `trustmrr key tmrr_…`.",
      ),
    );
    process.exit(1);
  }
  return key;
}

function checkEngine(engine?: string): void {
  if (engine && engine !== "claude-cli") {
    console.error(
      c.yellow(
        `Engine '${engine}' is not implemented; only 'claude-cli' (default) is supported. Continuing with claude-cli.`,
      ),
    );
  }
}

const program = new Command();

program
  .name("trustmrr")
  .description(
    "Ask natural-language questions about TrustMRR verified-revenue data via your Claude subscription.",
  )
  .version("0.1.0")
  .option("-k, --api-key <key>", "TrustMRR API key (overrides env and config)")
  .option("-m, --model <model>", "Claude model alias/name to use for answers")
  .option("--engine <engine>", "Answer engine: claude-cli (default)", "claude-cli");

program
  .command("key [value]")
  .description("Set or rotate your TrustMRR API key (stored in ~/.trustmrr-cli/config.json)")
  .action((value?: string) => {
    if (!value || !looksLikeKey(value.trim())) {
      console.error(c.red("Provide a key that starts with 'tmrr_': trustmrr key tmrr_…"));
      process.exit(1);
    }
    setApiKey(value.trim());
    console.log(c.green("Saved TrustMRR key to ~/.trustmrr-cli/config.json (chmod 600)."));
  });

program
  .command("ask <question...>")
  .description("Ask a single question and print the answer (non-interactive)")
  .action(async (questionParts: string[]) => {
    const opts = program.opts<GlobalOpts>();
    checkEngine(opts.engine);
    ensureDirs();
    const key = requireKey(opts.apiKey);
    const question = questionParts.join(" ");
    const systemPrompt = loadSystemPrompt();
    const mcpConfigPath = generateMcpConfig(key).path;

    process.stdout.write(c.dim("  → thinking…\n"));
    let sessionId: string | null = null;
    try {
      const result = await runClaude({
        question,
        mcpConfigPath,
        systemPrompt,
        model: opts.model,
        onToolCall: (call) => {
          if (call.name.startsWith("mcp__trustmrr__"))
            process.stdout.write(`${toolStatusLine(call.name, call.input)}\n`);
        },
        onSessionId: (id) => {
          sessionId = id;
        },
      });
      if (result.sessionId) sessionId = result.sessionId;
      console.log("");
      console.log(result.isError ? c.red(result.text) : result.text);
      if (sessionId && result.text) {
        recordExchange(sessionId, question, result.text, result.toolCalls);
        console.log(
          c.dim(`\n(session ${sessionId} — resume in the REPL with /resume ${sessionId})`),
        );
      }
    } catch (err) {
      console.error(c.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("repl", { isDefault: true })
  .description("Start the interactive REPL (default)")
  .action(async () => {
    const opts = program.opts<GlobalOpts>();
    checkEngine(opts.engine);
    await startRepl({ apiKeyFlag: opts.apiKey, model: opts.model });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(c.red(`Fatal: ${(err as Error).message}`));
  process.exit(1);
});
