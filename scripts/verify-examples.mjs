import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const catalog = JSON.parse(readFileSync("examples/catalog.json", "utf8"));
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const item of catalog) for (const theme of ["light", "dark"]) {
  const page = join("dist", "examples", item.id, `${item.id}${theme === "light" ? "-light" : ""}.html`);
  run(["scripts/capture.mjs", page, "--reduced", "--width", "1200", "--out", `shots/ci/${item.id}-${theme}.png`]);
  if (item.id === "multi-agent-orchestration") {
    run(["scripts/drive.mjs", page, JSON.stringify([["eval", "window.__cutaway.pause();window.__cutaway.open(1)"], ["wait", 1800], ["lines", `shots/ci/${item.id}-${theme}-lines.png`], ["shot", `shots/ci/${item.id}-${theme}-open.png`]])]);
    run(["scripts/capture.mjs", page, "--reduced", "--width", "390", "--out", `shots/ci/${item.id}-${theme}-phone.png`]);
  }
  if (item.kind === "SVG + WebGL") run(["scripts/drive.mjs", page, "[]", "--no-webgl", "--reduced"]);
}
run(["examples/multi-agent-orchestration/build.mjs", "--light", "--audit"]);
console.log(`Cutaway · verified ${catalog.length} studies in both themes, flagship line checks, phone views, and shader fallbacks`);
