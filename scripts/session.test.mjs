import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { describe, fromThisSession, measure, parseMinutes, parseTokens } from "./session.mjs";

const ID = "0123abcd-0000-0000-0000-000000000000";
const PROMPT = "/cutaway a token bucket rate limiter, opened up";
const at = (minute) => new Date(Date.UTC(2026, 9, 12, 9, minute)).toISOString();
const ask = (minute, text) => ({ type: "user", timestamp: at(minute), sessionId: ID, uuid: `u${minute}`, message: { role: "user", content: text } });
const reply = (minute, id, input, output, extra = {}) => ({
  type: "assistant",
  timestamp: at(minute),
  sessionId: ID,
  uuid: `a${minute}-${output}`,
  message: { id, role: "assistant", content: [{ type: "text", text: "ok" }], usage: { input_tokens: input, cache_creation_input_tokens: 1000, cache_read_input_tokens: 9_000_000, output_tokens: output } },
  ...extra,
});
const lines = (entries) => entries.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n") + "\n";

function fakeRoot() {
  const root = mkdtempSync(join(tmpdir(), "cutaway-session-"));
  const project = join(root, "-work");
  mkdirSync(join(project, ID, "subagents"), { recursive: true });
  writeFileSync(join(project, `${ID}.jsonl`), lines([
    ask(0, "Fix the typo in the README"),
    reply(1, "m0", 50, 50),
    { type: "user", timestamp: at(5), sessionId: ID, message: { role: "user", content: [{ type: "text", text: PROMPT }] } },
    reply(6, "m1", 200, 200),
    reply(6, "m1", 200, 400),
    "not json at all",
    reply(8, "m2", 300, 200),
    reply(70, "m3", 10, 20),
    ask(80, "Now publish it to the community gallery please"),
    reply(81, "m4", 999, 999),
  ]));
  writeFileSync(join(project, ID, "subagents", "agent-1.jsonl"), lines([reply(7, "s1", 10, 20, { isSidechain: true, agentId: "a1" })]));
  return root;
}

test("measures the window from the figure's request to the publish request", () => {
  const root = fakeRoot();
  try {
    const measured = fromThisSession({ prompt: PROMPT, env: { CLAUDE_CODE_SESSION_ID: ID }, root });
    assert.equal(measured.tokens, 1500 + 1600 + 1030 + 1030);
    assert.equal(measured.minutes, 13);
    assert.equal(measured.from, at(5));
    assert.equal(measured.to, at(80));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds nothing without a session", () => {
  assert.equal(fromThisSession({ env: {} }), null);
  assert.equal(measure([]), null);
});

test("parses times and token counts and describes them", () => {
  assert.equal(parseMinutes("1h30m"), 90);
  assert.equal(parseMinutes("45"), 45);
  assert.equal(parseMinutes("soon"), undefined);
  assert.equal(parseMinutes(""), null);
  assert.equal(parseTokens("1.2M"), 1_200_000);
  assert.equal(parseTokens("450k"), 450_000);
  assert.equal(parseTokens("lots"), undefined);
  assert.equal(parseTokens(""), null);
  assert.equal(describe({ minutes: 95, tokens: 1_240_000 }), "about 1 h 35 min and 1.2M tokens");
});
