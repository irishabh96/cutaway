// Kit fingerprint: one SHA-256 over the paths and contents of the kit files, so a gallery can tell
// whether it holds the same kit version. The algorithm must stay identical to the gallery's.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export function KIT_FILES(path) {
  if (path === "scripts/inline-kit.mjs") return true;
  return path.startsWith("kit/") && path.split("/").every((segment) => !segment.startsWith("."));
}

export function fingerprintOf(entries) {
  const lines = entries
    .filter(([path]) => KIT_FILES(path))
    .map(([path, content]) => `${path}\0${sha256(content)}\n`)
    .sort();
  if (!lines.length) throw new Error("fingerprint: no kit files found");
  return `sha256:${sha256(lines.join(""))}`;
}

function walk(directory, prefix, out) {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    const relative = `${prefix}/${name}`;
    const info = statSync(full);
    if (info.isDirectory()) walk(full, relative, out);
    else if (info.isFile()) out.push(relative);
  }
  return out;
}

export function fingerprintOfSkill(skillRoot) {
  const paths = [...walk(join(skillRoot, "kit"), "kit", []), "scripts/inline-kit.mjs"];
  return fingerprintOf(paths.map((path) => [path, readFileSync(join(skillRoot, ...path.split("/")))]));
}
