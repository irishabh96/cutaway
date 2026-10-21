import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { fingerprintOf, fingerprintOfSkill } from "./fingerprint.mjs";
import { publish, rewriteSkillPaths, submitPlan } from "./publish.mjs";

const execute = promisify(execFile);
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(REPO, "scripts", "publish.mjs");
const FIGURE = join(REPO, "examples", "dial-indicator");

function gallery() {
  const root = mkdtempSync(join(tmpdir(), "cutaway-gallery-"));
  mkdirSync(join(root, "figures"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "validate.mjs"), "");
  return root;
}

const base = (into, extra = {}) => ({
  source: FIGURE, into, id: "dial-indicator", title: " Dial indicator ", prompt: " /cutaway a dial indicator ", author: "@Octo-Cat",
  agent: "Codex", date: "2026-10-12", noPreview: true, noSession: true, ...extra,
});

test("the kit fingerprint is order-independent and matches the known answer", () => {
  const entries = [["kit/a.mjs", "1"], ["kit/b.mjs", "2"], ["scripts/inline-kit.mjs", "3"], ["README.md", "x"], ["kit/.hidden/c.mjs", "4"]];
  const expected = "sha256:a249319b0f2a8db4899fbb430c782c55b7699df73809c5c0e4c07495c72eae8c";
  assert.equal(fingerprintOf(entries), expected);
  assert.equal(fingerprintOf([...entries].reverse()), expected);
  assert.throws(() => fingerprintOf([["README.md", "x"]]), /no kit files/);
  assert.match(fingerprintOfSkill(REPO), /^sha256:[0-9a-f]{64}$/);
});

test("skill paths point through the gallery's .skill link", () => {
  const paths = { fromDir: join(REPO, "examples", "x"), toDir: "/g/figures/x/src", source: join(REPO, "examples", "x"), skill: REPO, skillLink: "/g/.skill" };
  const input = 'import * as k from "../../kit/iso-kit.mjs";\nimport { kitScript } from \'../../scripts/inline-kit.mjs\';\nimport "./live.mjs";\nconst half = 1 / 2, path = "/2";';
  const { text, outside } = rewriteSkillPaths(input, paths);
  assert.ok(text.includes('"../../../.skill/kit/iso-kit.mjs"'));
  assert.ok(text.includes("'../../../.skill/scripts/inline-kit.mjs'"));
  assert.ok(text.includes('"./live.mjs"'));
  assert.ok(text.includes('"/2"'));
  assert.deepEqual(outside, []);
  const elsewhere = rewriteSkillPaths('import "../../elsewhere/x.mjs";', { ...paths, fromDir: "/work/a/b", source: "/work/a/b" });
  assert.deepEqual(elsewhere.outside, ["../../elsewhere/x.mjs"]);
});

test("publishing the dial indicator copies source only and rebuilds identical pages", () => {
  const into = gallery();
  try {
    const result = publish(base(into));
    assert.equal(result.dest, join(into, "figures", "octo-cat", "dial-indicator"));
    const src = readdirSync(join(result.dest, "src"));
    assert.ok(src.includes("build.mjs"));
    assert.ok(!src.some((name) => name.endsWith(".html") || name === "poster.png"));
    const figure = JSON.parse(readFileSync(join(result.dest, "figure.json"), "utf8"));
    assert.equal(figure.author, "Octo-Cat");
    assert.equal(figure.title, "Dial indicator");
    assert.equal(figure.kind, "SVG");
    assert.equal(figure.license, "MIT");
    assert.equal(figure.created, "2026-10-12");
    assert.equal(figure.skill.kit, fingerprintOfSkill(REPO));
    assert.deepEqual(figure.build, [["src/build.mjs", "--light"], ["src/build.mjs"]]);
    assert.deepEqual(figure.pages, { dark: "src/dial-indicator.html", light: "src/dial-indicator-light.html" });
    assert.ok(existsSync(join(into, ".skill", "kit", "iso-kit.mjs")));
    for (const command of figure.build) {
      const run = spawnSync(process.execPath, command, { cwd: result.dest, encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
    }
    for (const page of ["dial-indicator.html", "dial-indicator-light.html"])
      assert.ok(readFileSync(join(result.dest, "src", page)).equals(readFileSync(join(FIGURE, page))), `${page} differs from the committed page`);
    assert.throws(() => publish(base(into)), /already exists/);
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});

test("a folder without the gallery layout is refused", () => {
  const into = mkdtempSync(join(tmpdir(), "cutaway-not-gallery-"));
  try {
    assert.throws(() => publish(base(into)), /doesn't look like a compatible gallery/);
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});

test("the CLI records the chosen license and rejects others", async () => {
  const into = gallery();
  const cli = (id, license) => execute(process.execPath, [SCRIPT, FIGURE, "--into", into, "--id", id, "--title", "Dial", "--prompt", "/cutaway a dial", "--author", "octo-cat", "--license", license, "--no-preview", "--no-session"], { timeout: 120000 });
  try {
    for (const [id, license] of [["dial-mit", "MIT"], ["dial-cc", "CC-BY-4.0"]]) {
      await cli(id, license);
      assert.equal(JSON.parse(readFileSync(join(into, "figures", "octo-cat", id, "figure.json"), "utf8")).license, license);
    }
    const failure = await cli("dial-gpl", "GPL-3.0").then(() => null, (error) => error);
    assert.equal(failure?.code, 1);
    assert.match(failure.stderr, /--license must be one of: MIT, CC-BY-4.0/);
    assert.ok(!existsSync(join(into, "figures", "octo-cat", "dial-gpl")));
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});

test("submit plans differ for owners and guests", () => {
  const common = { upstream: "gallery-owner/gallery-repo", author: "Octo-Cat", id: "token-bucket", title: "Token bucket" };
  const owner = submitPlan({ ...common, login: "gallery-owner", canPush: true });
  assert.equal(owner.target, "gallery-owner/gallery-repo");
  assert.ok(!owner.steps.some((step) => step.gh?.[1] === "fork"));
  assert.deepEqual(owner.steps.at(-1).pr, { repo: "gallery-owner/gallery-repo", head: "figure/token-bucket", title: "Add Token bucket" });
  const guest = submitPlan({ ...common, login: "Octo-Cat", canPush: false });
  assert.equal(guest.target, "Octo-Cat/gallery-repo");
  assert.deepEqual(guest.steps[0].gh, ["repo", "fork", "gallery-owner/gallery-repo", "--clone=false"]);
  assert.equal(guest.steps.at(-1).pr.head, "Octo-Cat:figure/token-bucket");
  assert.ok(guest.steps.some((step) => step.git?.[0] === "add" && step.git.at(-1) === "figures/octo-cat/token-bucket"));
});

test("a failed forced publish keeps the figure it would have replaced", () => {
  const into = gallery();
  try {
    const first = publish(base(into));
    const before = readFileSync(join(first.dest, "figure.json"), "utf8");
    assert.throws(() => publish(base(into, { force: true, pages: ["missing.html"] })), /page missing\.html not found/);
    assert.equal(readFileSync(join(first.dest, "figure.json"), "utf8"), before);
    assert.ok(existsSync(join(first.dest, "src", "build.mjs")));
    assert.deepEqual(readdirSync(join(into, "figures", "octo-cat")), ["dial-indicator"]);
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});
