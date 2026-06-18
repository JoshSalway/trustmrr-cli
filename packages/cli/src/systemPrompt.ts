import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Load the inner system prompt. It lives at the package root (system-prompt.md),
 * one level above both src/ (dev via tsx) and dist/ (built), so the same relative
 * path resolves in either mode.
 */
export function loadSystemPrompt(): string {
  const url = new URL("../system-prompt.md", import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}
