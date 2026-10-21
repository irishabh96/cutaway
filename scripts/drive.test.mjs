import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const drive = fileURLToPath(new URL("drive.mjs", import.meta.url));

async function run(actions) {
  const directory = await mkdtemp(join(tmpdir(), "cutaway-drive-"));
  try {
    const page = join(directory, "figure.html");
    const file = join(directory, "actions.json");
    await writeFile(page, '<!doctype html><div class="iso-plate" tabindex="0">Figure</div>');
    await writeFile(file, JSON.stringify(actions));
    try {
      return { code: 0, ...(await execute(process.execPath, [drive, page, "--actions", file], { timeout: 30000 })) };
    } catch (error) {
      return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const one = (expression, kind = "eval") => run([[kind, expression, 200]]);

test("a throwing eval fails the run", async () => {
  const result = await one("(()=>{throw new Error('drive assertion failed')})()");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /drive assertion failed/);
  assert.doesNotMatch(result.stdout, /console: clean/);
});

test("a rejected eval fails the run", async () => {
  const result = await one("Promise.reject(new Error('drive async assertion failed'))");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /drive async assertion failed/);
});

test("eval prints its value as JSON", async () => {
  const result = await one("({checked: true})");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /eval: \{"checked":true\}/);
  assert.match(result.stdout, /console: clean/);
});

test("eval prints undefined", async () => {
  const result = await one("void 0");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /eval: undefined/);
  assert.match(result.stdout, /console: clean/);
});

test("a syntax error fails the run", async () => {
  const result = await one("(()");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /SyntaxError/);
});

test("a throwing until condition fails the run", async () => {
  const result = await one("(()=>{throw new Error('until assertion failed')})()", "until");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /until assertion failed/);
});

test("conditions that already hold pass even with a 1 ms budget", async () => {
  const result = await run([["until", "true", 1], ["until", "Promise.resolve(1)", 1]]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /console: clean/);
});

test("until waits for a page condition", async () => {
  const result = await one("document.querySelector('.iso-plate') !== null", "until");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /console: clean/);
});
