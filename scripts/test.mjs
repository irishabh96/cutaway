import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, delimiter } from "node:path";

const tests = readdirSync("scripts").filter((name) => name.endsWith(".test.mjs")).sort().map((name) => `scripts/${name}`);
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=2", ...tests], {
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: [resolve("node_modules"), process.env.NODE_PATH].filter(Boolean).join(delimiter) },
});
process.exitCode = result.status ?? 1;
