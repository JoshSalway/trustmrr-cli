import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".trustmrr-cli");
export const CONVO_DIR = join(CONFIG_DIR, "conversations");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type Engine = "claude-cli" | "sdk";

export interface Config {
  apiKey?: string;
  defaultEngine?: Engine;
  model?: string;
}

export function ensureDirs(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  mkdirSync(CONVO_DIR, { recursive: true });
  // Best-effort lockdown of the config dir (contains the key).
  try {
    chmodSync(CONFIG_DIR, 0o700);
  } catch {
    /* non-fatal on platforms without chmod semantics */
  }
}

export function readConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  const raw = readFileSync(CONFIG_FILE, "utf8");
  try {
    return JSON.parse(raw) as Config;
  } catch {
    // Tolerate a config file that contains just a bare key (a common slip when
    // pasting the key straight in). Extract the tmrr_ token if present.
    const match = raw.match(/tmrr_[A-Za-z0-9_-]+/);
    return match ? { apiKey: match[0] } : {};
  }
}

export function writeConfig(cfg: Config): void {
  ensureDirs();
  writeFileSync(CONFIG_FILE, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    /* non-fatal */
  }
}

/** Persist (or rotate) the API key into config.json without touching other fields. */
export function setApiKey(apiKey: string): void {
  const cfg = readConfig();
  cfg.apiKey = apiKey.trim();
  writeConfig(cfg);
}

/**
 * Resolve the TrustMRR API key. Precedence: --api-key flag > env > config.json.
 * Returns undefined if none is set anywhere.
 */
export function resolveApiKey(flagKey?: string): string | undefined {
  const fromFlag = flagKey?.trim();
  if (fromFlag) return fromFlag;
  const fromEnv = process.env.TRUSTMRR_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = readConfig().apiKey?.trim();
  if (fromConfig) return fromConfig;
  return undefined;
}

export function looksLikeKey(key: string | undefined): key is string {
  return !!key && key.startsWith("tmrr_") && key.length > 8;
}
