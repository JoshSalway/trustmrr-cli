import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { CONVO_DIR, ensureDirs } from "./config.js";

const INDEX_FILE = join(CONVO_DIR, "index.json");

export interface Turn {
  ts: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ name: string; input?: unknown }>;
  sessionId: string;
}

export interface IndexEntry {
  title: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  file: string;
}

type Index = Record<string, IndexEntry>;

function isoStamp(): string {
  return new Date().toISOString();
}

/** Filesystem-safe filename per conversation: <createdAt>__<sessionId>.jsonl */
function fileNameFor(sessionId: string, createdAt: string): string {
  const safeStamp = createdAt.replace(/[:.]/g, "-");
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safeStamp}__${safeId}.jsonl`;
}

function readIndex(): Index {
  if (!existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf8")) as Index;
  } catch {
    return {};
  }
}

function writeIndex(idx: Index): void {
  writeFileSync(INDEX_FILE, `${JSON.stringify(idx, null, 2)}\n`);
}

/**
 * Record one user->assistant exchange under a session. Creates the JSONL file
 * and index entry on first write; appends thereafter.
 */
export function recordExchange(
  sessionId: string,
  userText: string,
  assistantText: string,
  toolCalls: Array<{ name: string; input?: unknown }>,
): void {
  ensureDirs();
  const idx = readIndex();
  const now = isoStamp();

  let entry = idx[sessionId];
  if (!entry) {
    const createdAt = now;
    entry = {
      title: userText.slice(0, 80).replace(/\s+/g, " ").trim() || "(untitled)",
      createdAt,
      updatedAt: now,
      turnCount: 0,
      file: fileNameFor(sessionId, createdAt),
    };
    idx[sessionId] = entry;
  }

  const filePath = join(CONVO_DIR, entry.file);
  const userTurn: Turn = { ts: now, role: "user", text: userText, sessionId };
  const assistantTurn: Turn = {
    ts: now,
    role: "assistant",
    text: assistantText,
    sessionId,
    ...(toolCalls.length ? { toolCalls } : {}),
  };
  appendFileSync(filePath, `${JSON.stringify(userTurn)}\n${JSON.stringify(assistantTurn)}\n`);

  entry.updatedAt = now;
  entry.turnCount += 2;
  writeIndex(idx);
}

export function listConversations(): Array<IndexEntry & { sessionId: string }> {
  const idx = readIndex();
  return Object.entries(idx)
    .map(([sessionId, e]) => ({ sessionId, ...e }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
