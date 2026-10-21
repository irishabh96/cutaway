import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

for (const name of readdirSync("examples").sort()) {
  const build = join("examples", name, "build.mjs");
  if (!existsSync(build)) continue;
  for (const args of [[], ["--light"]]) {
    console.log(`Cutaway · ${name}${args.length ? " · light" : " · dark"}`);
    const result = spawnSync(process.execPath, [build, ...args], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
for (const [script, args] of [["examples/turning-dial/build.mjs", ["--light", "--verify"]], ["examples/turning-dial/stress.mjs", ["--light"]]]) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
