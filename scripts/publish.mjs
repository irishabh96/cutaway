#!/usr/bin/env node
// Copies a finished figure's source into a local clone of a compatible community gallery
// (figures/<author>/<id>/src/ + figure.json, kit reached through the gallery's .skill link),
// and with --submit opens a pull request for it with gh and git.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintOfSkill } from "./fingerprint.mjs";
import { describe, fromThisSession, parseMinutes, parseTokens } from "./session.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS = ["Claude Code", "OpenCode", "Codex", "Antigravity", "Other"];
const LICENSES = ["MIT", "CC-BY-4.0"];
const KINDS = ["SVG", "SVG + WebGL", "SVG + 3D", "SVG + WebGL + 3D"];
const TYPED = new Set([".mjs", ".js", ".css", ".html", ".json", ".md", ".txt", ".svg"]);
const SKIPPED_DIRS = new Set(["node_modules", "shots", ".git"]);
const LINKED_EXT = /\.(js|mjs|css|json|html|svg)$/i;

const posix = (path) => path.split(sep).join("/");
const inside = (path, directory) => {
  const rel = relative(directory, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const dotted = (path) => (path.startsWith(".") ? path : `./${path}`);

// Points string literals that reach into this skill at the same files through the gallery's .skill link.
export function rewriteSkillPaths(text, { fromDir, toDir, source, skill, skillLink }) {
  const outside = [];
  const rewritten = text.replace(/(["'])((?:\.\.?)?\/(?:(?!\1)[^\n])*)\1/g, (whole, quote, path) => {
    const target = resolve(fromDir, path);
    if (!extname(path) && !inside(target, skill)) return whole;
    if (inside(target, source)) {
      if (!isAbsolute(path)) return whole;
      return `${quote}${dotted(posix(relative(fromDir, target)))}${quote}`;
    }
    if (inside(target, skill)) return `${quote}${dotted(posix(relative(toDir, join(skillLink, relative(skill, target)))))}${quote}`;
    if (LINKED_EXT.test(path)) outside.push(path);
    return whole;
  });
  return { text: rewritten, outside };
}

export function submitPlan({ login, canPush, upstream, author, id, title }) {
  const name = upstream.split("/")[1];
  const target = canPush ? upstream : `${login}/${name}`;
  const branch = `figure/${id}`;
  const folder = `figures/${String(author).replace(/^@/, "").toLowerCase()}/${id}`;
  const steps = [];
  if (!canPush) steps.push({ say: `fork ${upstream} to ${target}`, gh: ["repo", "fork", upstream, "--clone=false"] });
  steps.push(
    { say: "let git push with your GitHub CLI login", gh: ["auth", "setup-git"] },
    { say: `fetch ${upstream} main`, git: ["fetch", "--quiet", `https://github.com/${upstream}.git`, "main"] },
    { git: ["switch", "--quiet", "-C", branch, "FETCH_HEAD"] },
    { say: `copy the figure into ${folder} on branch ${branch}`, publish: true },
    { git: ["add", "--", folder] },
    { git: ["commit", "--quiet", "-m", `Add ${title}`, "--", folder] },
    { say: `push ${branch} to ${target}`, git: ["push", "--quiet", "--force", `https://github.com/${target}.git`, `HEAD:refs/heads/${branch}`] },
    { say: `open a pull request on ${upstream}`, pr: { repo: upstream, head: canPush ? branch : `${login}:${branch}`, title: `Add ${title}` } },
  );
  return { target, branch, folder, steps };
}

function listFiles(root, prefix = "") {
  const out = [];
  for (const name of readdirSync(join(root, prefix)).sort()) {
    if (name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    const info = lstatSync(join(root, rel));
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) out.push(...listFiles(root, rel));
    } else if (info.isFile()) out.push(rel);
  }
  return out;
}

const themeOf = (file) => readFileSync(file, "utf8").match(/<body\b[^>]*\sdata-theme=["']?([\w-]+)/i)?.[1];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "");
const isVerify = (name) => /-verify(-light)?\.html$/i.test(name);

function findPages(source, typed, wanted) {
  if (wanted?.length) {
    const pages = {};
    for (const name of wanted) {
      if (!typed.includes(name)) throw new Error(`page ${name} not found in ${source}; build the figure first`);
      const theme = themeOf(join(source, name));
      pages[theme === "light" || theme === "dark" ? theme : slug(basename(name, extname(name)))] = name;
    }
    return pages;
  }
  const top = typed.filter((name) => !name.includes("/") && name.toLowerCase().endsWith(".html"));
  const pairs = top.filter((name) => !/-light\.html$/i.test(name) && top.includes(name.replace(/\.html$/i, "-light.html")));
  if (pairs.length === 1) return { light: pairs[0].replace(/\.html$/i, "-light.html"), dark: pairs[0] };
  if (!pairs.length) {
    const rest = top.filter((name) => !isVerify(name) && !name.startsWith("turning-stress"));
    if (rest.length === 1) return { [themeOf(join(source, rest[0])) === "light" ? "light" : "page"]: rest[0] };
  }
  throw new Error(`can't tell which pages the figure builds (${top.length ? `found ${top.join(", ")}` : "found no pages"}); pass --pages a.html,b.html`);
}

function detectKind(texts) {
  const text = texts.join("\n");
  const webgl = /getContext\(\s*["'](?:webgl2?|experimental-webgl)["']/.test(text) || /\b(?:GLSL_ISO|glLayer)\b/.test(text);
  const turning = /TURN\.mount|\bturnScript\b|\bTURN_CSS\b|class=["'][^"']*\biso-turn/.test(text);
  return `SVG${webgl ? " + WebGL" : ""}${turning ? " + 3D" : ""}`;
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? result.error.message : ""}`.trim().split("\n").slice(-12).join("\n");
    throw new Error(`node ${args.map((arg) => basename(arg)).join(" ")} failed:\n${tail}`);
  }
}

export function publish(options) {
  const log = options.log ?? (() => {});
  const source = resolve(options.source);
  const into = resolve(options.into);
  const build = options.build ?? "build.mjs";
  const license = options.license ?? "MIT";
  const agent = options.agent ?? "Claude Code";
  if (!existsSync(join(source, build))) throw new Error(`no ${build} in ${source}; pass --build with the figure's build script`);
  if (!existsSync(join(into, "figures")) || !existsSync(join(into, "scripts", "validate.mjs")))
    throw new Error(`${into} doesn't look like a compatible gallery (it needs figures/ and scripts/validate.mjs)`);
  if (inside(source, REPO) && !inside(source, join(REPO, "examples")))
    throw new Error(`${source} is inside the skill but not in its examples/; publish the folder where the figure was built`);
  const author = String(options.author ?? "").replace(/^@/, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(author)) throw new Error(`${options.author} is not a GitHub username`);
  const dest = join(into, "figures", author.toLowerCase(), options.id);
  const aside = `${dest}.replaced`;
  let moved = false;
  if (existsSync(dest)) {
    if (!options.force) throw new Error(`${posix(relative(into, dest))} already exists; pick another --id or pass --force to replace it`);
    rmSync(aside, { recursive: true, force: true });
    renameSync(dest, aside);
    moved = true;
  }

  try {
    const files = listFiles(source);
    const typed = files.filter((name) => TYPED.has(extname(name).toLowerCase()));
    const pages = findPages(source, typed, options.pages);
    const pageFiles = new Set(Object.values(pages));
    const copied = typed.filter((name) => !pageFiles.has(name) && !isVerify(name));
    const skipped = files.filter((name) => !copied.includes(name) && !pageFiles.has(name));
    const skillLink = join(into, ".skill");
    const outside = [];
    for (const name of copied) {
      const from = join(source, name);
      const to = join(dest, "src", name);
      mkdirSync(dirname(to), { recursive: true });
      if (/\.m?js$/i.test(name)) {
        const result = rewriteSkillPaths(readFileSync(from, "utf8"), { fromDir: dirname(from), toDir: dirname(to), source, skill: REPO, skillLink });
        writeFileSync(to, result.text);
        outside.push(...result.outside.map((path) => `${name}: ${path}`));
      } else copyFileSync(from, to);
    }
    if (outside.length) throw new Error(`the figure reaches outside its folder; move what it needs into ${source}:\n  ${outside.join("\n  ")}`);

    let linked;
    let present = false;
    try {
      lstatSync(skillLink);
      present = true;
    } catch {}
    const kit = fingerprintOfSkill(REPO);
    if (!present) {
      symlinkSync(REPO, skillLink, process.platform === "win32" ? "junction" : "dir");
      linked = "created";
    } else {
      if (fingerprintOfSkill(skillLink) !== kit) throw new Error(`${skillLink} points at a different kit version; remove it and run again`);
      linked = "existing";
    }

    const commands = [];
    if (pages.light) commands.push([`src/${build}`, "--light"]);
    if (Object.keys(pages).some((key) => key !== "light")) commands.push([`src/${build}`]);
    for (const command of commands) {
      log(`building the ${command.includes("--light") ? "light page" : "page"} (may take a minute or two)`);
      runNode(command, dest);
    }

    let preview = null;
    if (!options.noPreview) {
      const page = pages.light ?? Object.values(pages)[0];
      preview = join(into, "shots", `${author.toLowerCase()}-${options.id}`, "preview.png");
      log(`taking a preview of ${page}`);
      runNode([join(REPO, "scripts", "capture.mjs"), join(dest, "src", page), "--reduced", "--width", "1200", "--out", preview], dest);
    }

    let measured = null;
    if (!options.noSession && !(options.minutes && options.tokens)) {
      measured = fromThisSession({ prompt: options.prompt });
      if (measured) log(`time and tokens from this session: ${describe(measured)}`);
    }
    const minutes = options.minutes ?? measured?.minutes;
    const tokens = options.tokens ?? measured?.tokens;

    const built = Object.values(pages).map((page) => join(dest, "src", page));
    const kind = options.kind ?? detectKind(built.filter((file) => existsSync(file)).map((file) => readFileSync(file, "utf8")));
    for (const file of built) rmSync(file, { force: true });

    const figure = { id: options.id, title: String(options.title).trim(), author, prompt: String(options.prompt).trim(), kind, agent };
    if (options.model) figure.model = options.model;
    if (minutes) figure.minutes = minutes;
    if (tokens) figure.tokens = tokens;
    figure.skill = { kit };
    figure.build = commands;
    figure.pages = Object.fromEntries(Object.entries(pages).map(([key, page]) => [key, `src/${page}`]));
    figure.preview = pages.light ? "light" : Object.keys(pages)[0];
    if (options.audit) figure.audit = true;
    figure.license = license;
    if (options.tags?.length) figure.tags = options.tags;
    figure.created = options.date ?? new Date().toISOString().slice(0, 10);
    writeFileSync(join(dest, "figure.json"), `${JSON.stringify(figure, null, 2)}\n`);

    if (moved) rmSync(aside, { recursive: true, force: true });
    return { dest, figure, skipped, linked, preview, measured };
  } catch (error) {
    rmSync(dest, { recursive: true, force: true });
    if (moved) renameSync(aside, dest);
    throw error;
  }
}

// ---- CLI ----

const USAGE = `publish.mjs: copy a finished figure into a local clone of a compatible community gallery.

  node scripts/publish.mjs <figure folder> --into <gallery clone> --id <kebab-id> --title "…" --prompt "…" --author <github user>
      [--agent "Claude Code"|OpenCode|Codex|Antigravity|Other] [--model "…"] [--minutes 45] [--tokens 1.2M] [--no-session]
      [--license MIT|CC-BY-4.0] [--tags a,b] [--build build.mjs] [--pages a.html,b.html] [--kind "SVG + WebGL"]
      [--audit] [--no-preview] [--force] [--submit [--yes] [--dry-run] [--upstream owner/repo]]

Only the source is copied, to figures/<author>/<id>/src/ with a figure.json; the gallery builds the pages.
Kit imports are pointed at the gallery's .skill link, and the kit fingerprint is recorded.
--submit opens a pull request on --upstream (there is no default) after showing the plan; --dry-run only
shows it, --yes skips the question. See references/publish.md.`;

class UsageError extends Error {}

const VALUE_FLAGS = ["into", "id", "title", "prompt", "author", "agent", "model", "minutes", "tokens", "license", "tags", "build", "pages", "kind", "date", "upstream"];
const BOOLEAN_FLAGS = { "--no-session": "noSession", "--audit": "audit", "--no-preview": "noPreview", "--force": "force", "--submit": "submit", "--yes": "yes", "--dry-run": "dryRun" };

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (BOOLEAN_FLAGS[arg]) options[BOOLEAN_FLAGS[arg]] = true;
    else if (arg.startsWith("--") && VALUE_FLAGS.includes(arg.slice(2))) {
      const value = argv[++index];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      options[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) throw new UsageError(`unknown option ${arg}`);
    else if (options.source === undefined) options.source = arg;
    else throw new UsageError(`unexpected argument ${arg}; give one figure folder`);
  }
  if (options.help) return options;
  if (options.minutes !== undefined) {
    const minutes = parseMinutes(options.minutes);
    if (!minutes) throw new UsageError(`--minutes ${options.minutes} doesn't read as a time; try 45, 1h30m or 1.5h`);
    options.minutes = minutes;
  }
  if (options.tokens !== undefined) {
    const tokens = parseTokens(options.tokens);
    if (!tokens) throw new UsageError(`--tokens ${options.tokens} doesn't read as a count; try 120000, 450k or 1.2M`);
    options.tokens = tokens;
  }
  if (!options.source) throw new UsageError("give the figure folder");
  for (const flag of ["into", "id", "title", "prompt", "author"]) if (!options[flag]) throw new UsageError(`--${flag} is required`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.id)) throw new UsageError(`--id must be kebab-case (lowercase words joined by hyphens), not ${options.id}`);
  options.agent ??= "Claude Code";
  if (!AGENTS.includes(options.agent)) throw new UsageError(`--agent must be one of: ${AGENTS.join(", ")}`);
  options.license ??= "MIT";
  if (!LICENSES.includes(options.license)) throw new UsageError(`--license must be one of: ${LICENSES.join(", ")}`);
  if (options.kind !== undefined && !KINDS.includes(options.kind)) throw new UsageError(`--kind must be one of: ${KINDS.join(", ")}`);
  if (options.submit && !options.upstream) throw new UsageError("--submit needs --upstream owner/repo; there is no default destination");
  if (options.upstream !== undefined && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.upstream)) throw new UsageError(`--upstream must look like owner/repo, not ${options.upstream}`);
  options.tags = options.tags ? options.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  if (options.pages) options.pages = options.pages.split(",").map((page) => page.trim()).filter(Boolean);
  return options;
}

function report(options, result) {
  const { figure } = result;
  const folder = posix(relative(resolve(options.into), result.dest));
  console.log(`published ${folder} (${figure.kind}, kit ${figure.skill.kit.slice("sha256:".length, "sha256:".length + 12)}): source only, the gallery builds the pages`);
  if (figure.minutes && figure.tokens) console.log(`  made in ${describe(figure)}`);
  if (result.skipped.length) console.log(`  left out (not a source type): ${result.skipped.join(", ")}`);
  console.log(`  .skill link: ${result.linked}`);
  if (result.preview) console.log(`  preview: ${result.preview} (not committed; CI makes the real one)`);
}

function tool(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? result.error.message : ""}`.trim();
    const error = new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
    error.missing = result.error?.code === "ENOENT";
    throw error;
  }
  return result.stdout.trim();
}

async function submit(options, publishOptions) {
  const cwd = resolve(options.into);
  let login;
  try {
    login = tool("gh", ["api", "user", "--jq", ".login"], cwd);
  } catch {
    throw new Error("the GitHub CLI is needed to submit: install it from https://cli.github.com and run gh auth login");
  }
  const author = options.author.replace(/^@/, "");
  if (login.toLowerCase() !== author.toLowerCase()) throw new Error(`you are signed in to gh as ${login}, but --author is ${author}; they must match`);
  let canPush;
  try {
    canPush = tool("gh", ["api", `repos/${options.upstream}`, "--jq", ".permissions.push"], cwd) === "true";
  } catch {
    throw new Error(`${options.upstream} isn't visible to ${login}; check the name and your access`);
  }
  const plan = submitPlan({ login, canPush, upstream: options.upstream, author, id: options.id, title: options.title.trim() });
  console.log(`Submitting as @${login}:`);
  for (const step of plan.steps) if (step.say) console.log(`  · ${step.say}`);
  const recorded = options.minutes && options.tokens
    ? `given: ${describe(options)}`
    : options.noSession
      ? "none, pass --minutes and --tokens"
      : (() => {
          const measured = fromThisSession({ prompt: options.prompt });
          return measured ? `from this session: ${describe(measured)}` : "none, pass --minutes and --tokens";
        })();
  console.log(`  time and tokens: ${recorded}`);
  console.log(`  in the clone at ${cwd}`);
  if (options.dryRun) {
    console.log("Dry run: nothing was done.");
    return;
  }
  if (!options.yes) {
    let answer = "";
    if (process.stdin.isTTY) {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      answer = await prompt.question("Go ahead? [y/N] ");
      prompt.close();
    }
    if (!/^(y|yes)$/i.test(answer.trim())) throw new Error("not submitted; answer y, or pass --yes once the plan is agreed");
  }
  for (const step of plan.steps) {
    if (step.gh) tool("gh", step.gh, cwd);
    else if (step.git) tool("git", step.git, cwd);
    else if (step.publish) {
      const onMain = tool("git", ["ls-tree", "--name-only", "HEAD", "--", plan.folder], cwd);
      const result = publish({ ...publishOptions, force: Boolean(options.force) || !onMain });
      report(options, result);
    } else if (step.pr) {
      let url = tool("gh", ["pr", "list", "--repo", step.pr.repo, "--head", plan.branch, "--state", "open", "--json", "url", "--jq", ".[0].url"], cwd);
      if (!url) url = tool("gh", ["pr", "create", "--repo", step.pr.repo, "--base", "main", "--head", step.pr.head, "--title", step.pr.title, "--body", `${options.prompt.trim()}\n\nPublished with Cutaway's publish.mjs.`], cwd).split("\n").pop();
      console.log(`Pull request: ${url}`);
      console.log("Checks and a preview will appear on it.");
    }
  }
}

async function main(argv) {
  let options;
  try {
    options = parseCli(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`publish: ${error.message}`);
    console.log(USAGE);
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const publishOptions = {
    source: options.source, into: options.into, id: options.id, title: options.title, prompt: options.prompt, author: options.author,
    agent: options.agent, model: options.model, license: options.license, build: options.build, tags: options.tags, pages: options.pages,
    kind: options.kind, date: options.date, audit: options.audit, noPreview: options.noPreview, force: options.force,
    minutes: options.minutes, tokens: options.tokens, noSession: options.noSession, log: (line) => console.log(`  ${line}`),
  };
  if (options.submit) {
    await submit(options, publishOptions);
    return 0;
  }
  console.log(`publishing ${options.id}…`);
  const result = publish(publishOptions);
  report(options, result);
  const folder = posix(relative(resolve(options.into), result.dest));
  console.log("\nCheck it:");
  console.log(`  cd ${resolve(options.into)}`);
  console.log(`  node scripts/validate.mjs ${folder}`);
  console.log("\nPrepared locally. Review the folder with the user, then submit it with --submit --upstream owner/repo.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`publish: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
