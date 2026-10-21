import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { marked } from "marked";
import { pageHtml } from "../kit/iso-kit.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const SITE = "https://cutaway.phasr.sh";
const ANALYTICS_ID = process.env.GA_MEASUREMENT_ID?.trim() || "";
const SEARCH_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION?.trim() || "";
if (ANALYTICS_ID && !/^G-[A-Z0-9]+$/.test(ANALYTICS_ID)) throw new Error(`GA_MEASUREMENT_ID should look like G-XXXXXXXXXX, got "${ANALYTICS_ID}"`);
const catalog = JSON.parse(readFileSync(join(ROOT, "examples/catalog.json"), "utf8"));
const docs = [
  ["getting-started", "Getting started"],
  ["usage-and-prompts", "Usage & prompts"],
  ["architecture-and-kit", "Architecture & kit"],
  ["playground", "Prompt workbench"],
  ["video-walkthrough-script", "Record a walkthrough"],
];
const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const name of ["index.html", "styles.css", "app.mjs", "assets", "showcase", "CNAME"]) cpSync(join(ROOT, "site", name), join(DIST, name), { recursive: true });
cpSync(join(ROOT, "examples"), join(DIST, "examples"), {
  recursive: true,
  filter: (path) => !["node_modules", "shots", ".scratch", ".cache", ".DS_Store"].includes(basename(path)) && !/-(a4|letter)\.(html|png)$/.test(path) && !/-letter\.pdf$/.test(path),
});
if (existsSync(join(ROOT, "media"))) cpSync(join(ROOT, "media"), join(DIST, "media"), { recursive: true, filter: (path) => basename(path) !== "frames" });
for (const name of ["LICENSE", "README.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "CHANGELOG.md", "SKILL.md"]) {
  cpSync(join(ROOT, name), join(DIST, name));
  mkdirSync(join(DIST, "source"), { recursive: true });
  cpSync(join(ROOT, name), join(DIST, "source", name));
}
for (const name of ["kit", "references", "docs"]) cpSync(join(ROOT, name), join(DIST, "source", name), { recursive: true });
writeFileSync(join(DIST, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
writeFileSync(join(DIST, ".nojekyll"), "");

for (const item of catalog.filter((item) => item.react)) {
  const out = join(DIST, "examples", item.id);
  const result = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{${item.component}}from'./examples/${item.id}/figure.tsx';createRoot(document.getElementById('root')).render(React.createElement(${item.component}));`, resolveDir: ROOT, loader: "tsx" },
    bundle: true, minify: true, format: "esm", platform: "browser", jsx: "automatic", write: false,
    outfile: join(out, "preview.js"), define: { "process.env.NODE_ENV": '"production"' },
  });
  let css = "";
  for (const output of result.outputFiles) {
    if (output.path.endsWith(".css")) css += output.text;
    else writeFileSync(join(out, "preview.js"), output.contents);
  }
  for (const theme of ["light", "dark"]) {
    const html = pageHtml({ title: item.title, theme, width: 760, body: `<div id="root"></div><noscript>This React study needs JavaScript. Inspect its source in the gallery.</noscript>`, script: `import './preview.js';` }).replace("</style>", css + "</style>");
    writeFileSync(join(out, `${item.id}${theme === "light" ? "-light" : ""}.html`), html);
  }
}

function docPage(slug, title, content) {
  const nav = docs.map(([id, label]) => `<a href="../${id}/"${id === slug ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("");
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(title)} — Cutaway documentation"><meta property="og:title" content="${esc(title)} · Cutaway"><meta property="og:type" content="article"><meta property="og:site_name" content="Cutaway"><meta property="og:url" content="${SITE}/docs/${slug}/"><meta property="og:image" content="${SITE}/assets/social-preview.png"><meta name="twitter:card" content="summary_large_image"><title>${esc(title)} · Cutaway</title><link rel="icon" href="../../assets/mark.svg"><link rel="stylesheet" href="../../styles.css"><script type="module" src="../../app.mjs"></script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header wrap"><a class="brand" href="../../"><img src="../../assets/mark.svg" alt="" width="30" height="30">cutaway<span class="brand-version">DOCS</span></a><nav aria-label="Main navigation"><a href="../../#gallery">Gallery</a><a href="../../showcase/caddi-pitch/">Showcase</a><a href="https://github.com/irishabh96/cutaway">GitHub ↗</a><button class="theme-button" type="button" data-theme-toggle aria-label="Switch to dark theme">◐ <span>Dark</span></button></nav></header><div class="docs-layout wrap"><aside class="docs-sidebar"><p>THE FIELD GUIDE</p><nav aria-label="Documentation">${nav}</nav></aside><main id="content" class="docs-content">${content}</main></div><footer class="site-footer wrap"><a class="brand" href="../../">cutaway</a><p>See inside the systems you build.</p><div><a href="../../LICENSE">MIT license</a><a href="../../source/CONTRIBUTING.md">Contribute ↗</a></div><small>© 2026 Rishabh Bhatia</small></footer><div class="toast" data-toast role="status" aria-live="polite"></div></body></html>`;
}

for (const [slug, title] of docs) {
  let html;
  if (slug === "playground") {
    html = `<h1>Prompt workbench</h1><p>Choose what readers should discover. Copy the prompt into your installed coding agent to build the figure.</p><section class="playground" data-playground><form><label>System<textarea name="system">an agent orchestrator with a planner, three workers, and a review barrier</textarea></label><label>View<select name="view"><option>a direct architectural cutaway</option><option>a physical metaphor</option></select></label><label>Rendering mode<select name="mode"><option>pure isometric SVG</option><option>SVG + WebGL for continuous effects</option><option>true 3D beta for moving parts</option></select></label><label>Interaction<input name="interaction" value="open layers, change parallelism, and step the model"></label><label>Agent<select name="agent"><option value="slash">Slash-command agent</option><option value="codex">Codex</option></select></label><pre data-prompt-output></pre><button class="button-primary" type="submit" data-copy-prompt>Copy prompt ↗</button></form></section><p>Bring real counts, rates, boundaries, and failure assumptions. <a href="../usage-and-prompts/">The cookbook</a> has fourteen starting points. The workbench composes a prompt locally; your coding agent generates and audits the output.</p><a class="button-primary" href="../../examples/multi-agent-orchestration/multi-agent-orchestration-light.html">Try the working agent example ↗</a>`;
  } else {
    html = marked.parse(readFileSync(join(ROOT, "docs", `${slug}.md`), "utf8"));
    html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, text) => `<h${level} id="${text.replace(/<[^>]*>/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}">${text}</h${level}>`);
    html = html.replace(/href="\.\.\/([^"/]+\.md)"/g, 'href="../../source/$1"');
  }
  const dir = join(DIST, "docs", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), docPage(slug, title, html));
}
writeFileSync(join(DIST, "404.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found · Cutaway</title></head><body><h1>This layer is missing.</h1><p>Return to <a href="${SITE}/">Cutaway</a> or <a href="https://github.com/irishabh96/cutaway">the source repository</a>.</p></body></html>`);

// Search and analytics: canonical URLs, a sitemap, and Google tags when the deploy provides their IDs.
cpSync(join(ROOT, ".github/assets/social-preview.png"), join(DIST, "assets/social-preview.png"));
const pages = readdirSync(DIST, { recursive: true }).filter((path) => path.endsWith(".html") && !path.startsWith("source/")).sort();
const urlOf = (path) => `${SITE}/${path.replace(/(^|\/)index\.html$/, "$1")}`;
const canonicalOf = (path) => {
  const light = path.replace(/([^/]+)\.html$/, "$1-light.html");
  return urlOf(!path.endsWith("-light.html") && pages.includes(light) ? light : path);
};
const indexable = ["index.html", ...docs.map(([slug]) => `docs/${slug}/index.html`), "showcase/caddi-pitch/index.html", ...catalog.map((item) => `examples/${item.id}/${item.id}-light.html`)].filter((path) => pages.includes(path));
for (const path of pages) {
  const file = join(DIST, path);
  const html = readFileSync(file, "utf8");
  const tags = [path === "404.html" || html.includes('rel="canonical"') ? "" : `<link rel="canonical" href="${canonicalOf(path)}">`];
  if (path === "index.html" && SEARCH_VERIFICATION) tags.push(`<meta name="google-site-verification" content="${esc(SEARCH_VERIFICATION)}">`);
  if (ANALYTICS_ID) tags.push(`<script>if(window.top===window.self){window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag("js",new Date());gtag("config","${ANALYTICS_ID}");var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}";document.head.appendChild(s)}</script>`);
  writeFileSync(file, html.replace("</head>", tags.join("") + "</head>"));
}
writeFileSync(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((path) => `  <url><loc>${urlOf(path)}</loc></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Search · ${indexable.length} pages in sitemap.xml · analytics ${ANALYTICS_ID ? ANALYTICS_ID : "off (set GA_MEASUREMENT_ID)"}`);
console.log(`Cutaway · built ${catalog.length} studies and ${docs.length} documentation pages → ${resolve(DIST)}`);
