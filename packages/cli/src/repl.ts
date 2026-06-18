import { type Interface, createInterface } from "node:readline";
import { runClaude } from "./claude.js";
import {
  type Config,
  ensureDirs,
  looksLikeKey,
  readConfig,
  resolveApiKey,
  setApiKey,
} from "./config.js";
import { generateMcpConfig } from "./mcpConfig.js";
import { listConversations, recordExchange } from "./persistence.js";
import { banner, c, toolStatusLine } from "./render.js";
import { loadSystemPrompt } from "./systemPrompt.js";

export interface ReplOptions {
  apiKeyFlag?: string;
  model?: string;
}

const HELP = `
${c.bold("Commands")}
  ${c.cyan("/help")}            show this help
  ${c.cyan("/new")}             start a fresh conversation (forgets prior context)
  ${c.cyan("/resume <id>")}     reopen a past conversation by session id
  ${c.cyan("/history")}         list saved conversations
  ${c.cyan("/key [tmrr_…]")}    set or rotate your TrustMRR API key
  ${c.cyan("/quit")}            exit (also: /exit, Ctrl-D)

Anything else is treated as a question about the TrustMRR verified-revenue dataset.
`.trimEnd();

export async function startRepl(opts: ReplOptions): Promise<void> {
  ensureDirs();
  const systemPrompt = loadSystemPrompt();
  let cfg: Config = readConfig();
  let apiKey = resolveApiKey(opts.apiKeyFlag);
  let mcpConfigPath: string | null = null;
  const model = opts.model ?? cfg.model;

  let currentSessionId: string | null = null;
  let activeAbort: AbortController | null = null;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.green("trustmrr ❯ "),
  });

  function ensureMcp(): boolean {
    if (!looksLikeKey(apiKey)) {
      console.log(
        c.yellow(
          "No TrustMRR API key set. Run /key tmrr_… (or set TRUSTMRR_API_KEY) to start querying.",
        ),
      );
      return false;
    }
    if (!mcpConfigPath) {
      try {
        mcpConfigPath = generateMcpConfig(apiKey).path;
      } catch (err) {
        console.log(c.red(`Could not start MCP server: ${(err as Error).message}`));
        return false;
      }
    }
    return true;
  }

  console.log(
    banner("TrustMRR CLI") + c.dim("  — verified-revenue research via your Claude subscription"),
  );
  console.log(c.dim("Type a question, or /help for commands.\n"));
  if (!looksLikeKey(apiKey)) {
    console.log(
      c.yellow("⚠ No TrustMRR API key found.") +
        c.dim(" Set one with /key tmrr_… or the TRUSTMRR_API_KEY env var.\n"),
    );
  }

  async function ask(question: string): Promise<void> {
    if (!ensureMcp() || !mcpConfigPath) return;
    activeAbort = new AbortController();
    process.stdout.write(
      c.dim(currentSessionId ? "  → thinking (continuing)…\n" : "  → thinking…\n"),
    );
    try {
      const result = await runClaude({
        question,
        mcpConfigPath,
        systemPrompt,
        model,
        resumeSessionId: currentSessionId,
        signal: activeAbort.signal,
        onToolCall: (call) => {
          if (call.name.startsWith("mcp__trustmrr__"))
            process.stdout.write(`${toolStatusLine(call.name, call.input)}\n`);
        },
        onSessionId: (id) => {
          currentSessionId = id;
        },
      });

      if (result.sessionId) currentSessionId = result.sessionId;

      console.log("");
      console.log(
        result.isError ? c.red(result.text || "(the model reported an error)") : result.text,
      );
      console.log("");

      if (currentSessionId && result.text) {
        recordExchange(currentSessionId, question, result.text, result.toolCalls);
      }
    } catch (err) {
      if (activeAbort?.signal.aborted) {
        console.log(c.yellow("\n(interrupted)\n"));
      } else {
        console.log(c.red(`\nError: ${(err as Error).message}\n`));
      }
    } finally {
      activeAbort = null;
    }
  }

  async function handleCommand(line: string): Promise<boolean> {
    const [cmd, ...rest] = line.slice(1).split(/\s+/);
    const arg = rest.join(" ").trim();
    switch (cmd) {
      case "help":
        console.log(HELP);
        return true;
      case "new":
        currentSessionId = null;
        console.log(c.dim("Started a fresh conversation.\n"));
        return true;
      case "resume":
        if (!arg) {
          console.log(c.yellow("Usage: /resume <session-id>  (see /history)\n"));
          return true;
        }
        currentSessionId = arg;
        console.log(c.dim(`Resuming session ${arg}.\n`));
        return true;
      case "history": {
        const convos = listConversations();
        if (!convos.length) {
          console.log(c.dim("No saved conversations yet.\n"));
          return true;
        }
        console.log(c.bold("\nSaved conversations:"));
        for (const conv of convos.slice(0, 30)) {
          console.log(
            `  ${c.cyan(conv.sessionId)}  ${c.dim(conv.updatedAt)}\n    ${conv.title}  ${c.dim(`(${conv.turnCount} turns)`)}`,
          );
        }
        console.log(c.dim("\nReopen with /resume <session-id>\n"));
        return true;
      }
      case "key": {
        const key = arg || (await promptLine(rl, c.cyan("Paste your TrustMRR API key (tmrr_…): ")));
        if (!looksLikeKey(key.trim())) {
          console.log(
            c.red("That doesn't look like a TrustMRR key (should start with 'tmrr_').\n"),
          );
          return true;
        }
        setApiKey(key.trim());
        apiKey = key.trim();
        cfg = readConfig();
        mcpConfigPath = null; // force regeneration with the new key
        console.log(c.green("Saved. Key stored in ~/.trustmrr-cli/config.json (chmod 600).\n"));
        return true;
      }
      case "quit":
      case "exit":
        return false;
      default:
        console.log(c.yellow(`Unknown command /${cmd}. Try /help.\n`));
        return true;
    }
  }

  // Ctrl-C: abort an in-flight query if one is running, else nudge to /quit.
  rl.on("SIGINT", () => {
    if (activeAbort) {
      activeAbort.abort();
    } else {
      console.log(c.dim("\n(Use /quit or Ctrl-D to exit.)"));
      rl.prompt();
    }
  });

  // Event-queue loop: serialise input handling and survive a long-running answer
  // even when stdin is piped (EOF) rather than a TTY. The async-iterator form of
  // readline closes mid-await on piped input, which drops follow-up turns.
  await new Promise<void>((resolve) => {
    const queue: string[] = [];
    let processing = false;
    let ended = false;
    let closeRequested = false;

    const finish = () => {
      if (!ended) {
        ended = true;
        resolve();
      }
    };

    async function drain(): Promise<void> {
      if (processing) return;
      processing = true;
      while (queue.length > 0 && !ended) {
        const line = (queue.shift() ?? "").trim();
        if (!line) continue;
        if (line.startsWith("/")) {
          const keepGoing = await handleCommand(line);
          if (!keepGoing) {
            finish();
            break;
          }
        } else {
          await ask(line);
        }
      }
      processing = false;
      if (ended) return;
      if (closeRequested && queue.length === 0) finish();
      else rl.prompt();
    }

    rl.on("line", (line) => {
      queue.push(line);
      void drain();
    });
    rl.on("close", () => {
      closeRequested = true;
      if (!processing) finish();
    });

    rl.prompt();
  });

  rl.close();
  console.log(c.dim("Bye."));
}

/** One-off line prompt (used for /key when no arg supplied). */
function promptLine(rl: Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, (answer) => resolve(answer)));
}
