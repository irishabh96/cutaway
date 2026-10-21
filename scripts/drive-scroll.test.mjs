import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

test("scroll followed immediately by click reaches the target on smooth-scrolling pages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cutaway-drive-scroll-"));
  try {
    const page = join(directory, "fixture.html");
    await writeFile(page, '<!doctype html><style>html{scroll-behavior:smooth}body{height:3000px;margin:0}button{position:absolute;top:1800px;left:100px;width:200px;height:80px}</style><button id="target" onclick="window.clicked=(window.clicked||0)+1">Click me</button>');
    const actions = [["scroll", "#target"], ["click", "#target"], ["eval", "window.clicked||0"]];
    const result = await promisify(execFile)(process.execPath, ["scripts/drive.mjs", page, JSON.stringify(actions)], { timeout: 20000 });
    assert.match(result.stdout, /eval: 1\b/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
