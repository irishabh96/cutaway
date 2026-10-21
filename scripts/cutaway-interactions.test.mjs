import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
for (const id of ["multi-agent-orchestration"]) test(`${id}: reduced motion stays still and explicit keyboard stepping works`, async () => {
  const actions = [
    ["eval", "window.__cutaway.state.time"],
    ["wait", 400],
    ["eval", "window.__cutaway.state.time"],
    ["key", "n", ".lab-stage"],
    ["eval", "window.__cutaway.state.time"],
    ["key", "ArrowRight", ".lab-stage"],
    ["eval", "({open:document.querySelector('[data-open]').getAttribute('aria-pressed'),parts:[...document.querySelector('[data-rig]').children].filter(el=>Number(el.dataset.layer)>=0).map(el=>el.getAttribute('transform'))})"],
  ];
  const result = await execute(process.execPath, ["scripts/drive.mjs", `examples/${id}/${id}-light.html`, JSON.stringify(actions), "--reduced"], { timeout: 30000 });
  const values = [...result.stdout.matchAll(/eval: (.*)/g)].map((match) => JSON.parse(match[1]));
  assert.equal(values[0], 0);
  assert.equal(values[1], 0);
  assert.equal(values[2], 1);
  assert.equal(values[3].open, "true");
  assert.ok(values[3].parts.every((transform) => transform && transform !== "translate(0 0)"));
});
