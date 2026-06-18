import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { ALLOWED_TOOLS } from "./mcpConfig.js";

export interface ToolCall {
  name: string;
  input?: unknown;
}

export interface ClaudeRunResult {
  text: string;
  sessionId: string | null;
  toolCalls: ToolCall[];
  isError: boolean;
}

export interface RunClaudeOptions {
  question: string;
  mcpConfigPath: string;
  systemPrompt: string;
  model?: string;
  resumeSessionId?: string | null;
  /** Called when the inner model invokes a tool, for live dim status lines. */
  onToolCall?: (call: ToolCall) => void;
  /** Called once the session id is known (from the init event). */
  onSessionId?: (id: string) => void;
  /** Overall timeout in ms (default 6 minutes — scan-heavy questions paginate + synthesise). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  is_error?: boolean;
  message?: {
    content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
  };
}

/**
 * Invoke the locally-installed, already-authenticated `claude` CLI in headless
 * print mode with the TrustMRR MCP server attached, parsing the stream-json event
 * feed. This bills the user's Claude subscription (not API credits) because we
 * shell out to their authenticated binary.
 */
export function runClaude(opts: RunClaudeOptions): Promise<ClaudeRunResult> {
  const args = [
    "-p",
    opts.question,
    "--mcp-config",
    opts.mcpConfigPath,
    "--strict-mcp-config",
    "--allowedTools",
    ALLOWED_TOOLS.join(","),
    "--append-system-prompt",
    opts.systemPrompt,
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);

  return new Promise<ClaudeRunResult>((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal: opts.signal,
    });

    const toolCalls: ToolCall[] = [];
    let sessionId: string | null = null;
    let finalText = "";
    let isError = false;
    const assistantTextChunks: string[] = [];
    let stderrBuf = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("claude timed out (no response). Try again or check `claude` is working."));
    }, opts.timeoutMs ?? 360_000);

    const rl = createInterface({ input: child.stdout });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let ev: StreamEvent;
      try {
        ev = JSON.parse(trimmed) as StreamEvent;
      } catch {
        return; // ignore any non-JSON noise
      }

      if (ev.session_id && !sessionId) {
        sessionId = ev.session_id;
        opts.onSessionId?.(sessionId);
      } else if (ev.session_id) {
        sessionId = ev.session_id;
      }

      if (ev.type === "assistant" && ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === "tool_use" && block.name) {
            const call: ToolCall = { name: block.name, input: block.input };
            toolCalls.push(call);
            opts.onToolCall?.(call);
          } else if (block.type === "text" && block.text) {
            assistantTextChunks.push(block.text);
          }
        }
      }

      if (ev.type === "result") {
        if (typeof ev.result === "string") finalText = ev.result;
        if (ev.is_error || ev.subtype === "error_during_execution") isError = true;
        if (ev.subtype && ev.subtype !== "success")
          isError = isError || ev.subtype.includes("error");
      }
    });

    child.stderr.on("data", (d) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error("`claude` CLI not found on PATH. Install Claude Code and sign in, then retry."),
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const text = finalText || assistantTextChunks.join("");
      if (code !== 0 && !text) {
        const hint = stderrBuf.trim().split("\n").slice(-4).join("\n");
        reject(
          new Error(
            `claude exited with code ${code}.${hint ? `\n${hint}` : " (no output captured)"}`,
          ),
        );
        return;
      }
      resolve({ text, sessionId, toolCalls, isError });
    });
  });
}
