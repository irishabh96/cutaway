#!/usr/bin/env node
// Line-end check for a built page: a thin wrapper that runs drive.mjs with a wait and one "lines" action.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HELP = `lines.mjs: find texture lines whose ends float in the drawing.

  node scripts/lines.mjs <page.html | url> [--out marks.png] [--tolerance 1] [--select css] [--wait 1500] [drive.mjs options]

Every open subpath of every .iso-line in the card has to stop on something: another stroke, a dot or an
outline within --tolerance viewBox px, or a spot covered by a fill painted after the line. A short
straight tick (7 px or less) only needs one of its ends rooted, within 2 px. Not checked: the kit's own
outlines, creases, bevels and tube edges, the faded ends of fadeLineSvg ramps, and ends marked free on
purpose with lineSvg(d, { free }) (true, "start" or "end").

  --out <png>       a 2x shot of the card with a red ring on every floating end
  --tolerance <px>  how far an end may stop from what it meets (1)
  --select <css>    the element to check (default: the first .iso-plate)
  --wait <ms>       settle time after load (1500)

Other options (--reduced, --theme, --width, --no-webgl, …) go to drive.mjs. Exits 1 on any floating end.`;

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}

const own = { out: null, tolerance: 1, select: null, wait: 1500 };
const rest = [];
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index];
  const name = arg.startsWith("--") ? arg.slice(2) : null;
  if (name && Object.hasOwn(own, name)) {
    const value = argv[++index];
    if (value === undefined) {
      console.error(`lines: ${arg} needs a value`);
      process.exit(1);
    }
    if (name === "tolerance" || name === "wait") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) {
        console.error(`lines: ${arg} needs a number`);
        process.exit(1);
      }
      own[name] = number;
    } else own[name] = value;
  } else rest.push(arg);
}

const [target, ...flags] = rest;
if (!target) {
  console.log(HELP);
  process.exit(1);
}
const actions = [["wait", own.wait], ["lines", own.out, own.select, { tolerance: own.tolerance }]];
const drive = fileURLToPath(new URL("drive.mjs", import.meta.url));
const result = spawnSync(process.execPath, [drive, target, JSON.stringify(actions), ...flags], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
