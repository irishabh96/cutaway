import assert from "node:assert/strict";
import test from "node:test";
import * as agents from "../examples/multi-agent-orchestration/model.mjs";

test("review waits for all tasks and parallelism shortens the critical path", () => {
  const one = agents.createModel(1), three = agents.createModel(3);
  assert.ok(agents.snapshot(three).cycle < agents.snapshot(one).cycle);
  for (let i = 0; i < 200; i++) {
    agents.advance(three, 0.1);
    const view = agents.snapshot(three);
    if (view.phase === "Reviewing" || view.phase === "Delivered") assert.equal(view.completed, 6);
    assert.ok(view.busy.length <= three.parallelism);
    assert.equal(new Set(view.busy).size, view.busy.length);
  }
});
