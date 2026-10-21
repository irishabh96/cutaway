// Time and tokens spent on a figure, read from this Claude Code session's own JSONL logs
// (subagent logs included). Idle stretches over ten minutes and cache reads are not counted.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const IDLE_CAP = 600000;

export function parseMinutes(text) {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) || undefined;
  const match = value.match(/^(?:(\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/);
  if (!match || (match[1] === undefined && match[2] === undefined)) return undefined;
  const hours = match[1] === undefined ? 0 : Number(match[1].replace(",", "."));
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const total = Math.round(hours * 60 + minutes);
  return total || undefined;
}

export function parseTokens(text) {
  const value = String(text ?? "").trim().toLowerCase().replace(/[\s,_]/g, "").replace(/tokens?$/, "");
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?|\.\d+)([km]?)$/);
  if (!match) return undefined;
  const count = Math.round(Number(match[1]) * (match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : 1));
  return count >= 1 && count <= 1e10 ? count : undefined;
}

function jsonlUnder(directory) {
  const found = [];
  if (!existsSync(directory)) return found;
  for (const name of readdirSync(directory).sort()) {
    const full = join(directory, name);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) found.push(...jsonlUnder(full));
    else if (info.isFile() && name.endsWith(".jsonl")) found.push(full);
  }
  return found;
}

export function sessionFiles(sessionId, root = join(homedir(), ".claude", "projects")) {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{8,64}$/i.test(sessionId) || !existsSync(root)) return [];
  for (const project of readdirSync(root).sort()) {
    const main = join(root, project, `${sessionId}.jsonl`);
    if (existsSync(main)) return [main, ...jsonlUnder(join(root, project, sessionId))];
  }
  return [];
}

function entriesOf(file) {
  const entries = [];
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return entries;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry.timestamp === "string") entries.push(entry);
    } catch {}
  }
  return entries;
}

function textOf(entry) {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
  return "";
}

const squash = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function measure(files, { prompt = "" } = {}) {
  if (!files?.length) return null;
  const [main, ...others] = files.map(entriesOf);
  main.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  const asks = main.filter((entry) => entry.type === "user" && !entry.isSidechain && textOf(entry).trim());

  let start;
  const wanted = squash(String(prompt ?? "")).slice(0, 48);
  if (wanted) start = asks.find((entry) => squash(textOf(entry)).includes(wanted));
  start ??= asks.find((entry) => /\bcutaway\b/i.test(textOf(entry)));
  start ??= main[0];
  if (!start) return null;
  const from = start.timestamp;
  const end = asks.find((entry) => entry.timestamp > from && /\bpublish\b/i.test(textOf(entry)) && /\b(community|gallery)\b/i.test(textOf(entry)));
  const to = end?.timestamp;

  const window = [...main, ...others.flat()].filter((entry) => entry.timestamp >= from && (to === undefined || entry.timestamp < to));
  const times = [...new Set(window.map((entry) => Date.parse(entry.timestamp)).filter(Number.isFinite))].sort((a, b) => a - b);
  let busy = 0;
  for (let index = 1; index < times.length; index++) busy += Math.min(times[index] - times[index - 1], IDLE_CAP);
  const minutes = Math.max(1, Math.round(busy / 60000));

  const spent = new Map();
  for (const entry of window) {
    const usage = entry.type === "assistant" ? entry.message?.usage : undefined;
    if (!usage) continue;
    const count = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
    const key = `${entry.sessionId ?? ""}|${entry.agentId ?? ""}|${entry.message?.id ?? entry.uuid ?? ""}`;
    spent.set(key, Math.max(spent.get(key) ?? 0, count));
  }
  const tokens = [...spent.values()].reduce((sum, count) => sum + count, 0) || null;

  const last = times.length ? new Date(times[times.length - 1]).toISOString() : undefined;
  return { minutes, tokens, from, to: to ?? last ?? from };
}

export function fromThisSession({ prompt, env = process.env, root } = {}) {
  return measure(sessionFiles(env.CLAUDE_CODE_SESSION_ID, root), { prompt });
}

export function describe({ minutes, tokens }) {
  const time = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  const count = tokens >= 1e6 ? `${(tokens / 1e6).toFixed(1).replace(/\.0$/, "")}M` : tokens >= 1e3 ? `${Math.round(tokens / 1e3)}k` : String(tokens);
  return `about ${time} and ${count} tokens`;
}
