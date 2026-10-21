import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

mkdirSync("media", { recursive: true });
const catalog = JSON.parse(readFileSync("examples/catalog.json", "utf8"));
const requested = process.argv.slice(2);
if (requested.some((id) => !catalog.some((item) => item.id === id))) throw new Error("Unknown example id");
for (const item of catalog.filter((item) => !requested.length || requested.includes(item.id))) for (const theme of ["light", "dark"]) {
  const url = pathToFileURL(resolve("dist", "examples", item.id, `${item.id}${theme === "light" ? "-light" : ""}.html`));
  if (item.id === "multi-agent-orchestration") url.searchParams.set("open", "1");
  const result = spawnSync(process.execPath, ["scripts/capture.mjs", url.href, "--select", ".iso-plate", "--reduced", "--width", "1000", "--scale", "1", "--out", `media/${item.id}-${theme}-poster.png`], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
