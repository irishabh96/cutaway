// Kit modules as plain script text for pages that inline the kit: the same file with the
// "export " keyword dropped from the start of each line, and nothing else changed.
import { readFileSync } from "node:fs";

const KIT = new URL("../kit/", import.meta.url);

function inlined(name) {
  return readFileSync(new URL(name, KIT), "utf8").replace(/^export /gm, "");
}

export const kitScript = () => inlined("iso-kit.mjs");
export const glScript = () => inlined("gl.mjs");
export const turnScript = () => inlined("turn.mjs");
export const fixedScript = () => `${inlined("turn-fixed.mjs")}\n${inlined("canvas-painter.mjs")}`;
export const glSharedScript = () => inlined("gl-shared.mjs");
