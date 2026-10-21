import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const NAME = "caddi-pitch";

const common = { bundle: true, minify: true, write: false, legalComments: "eof", logLevel: "warning" };
const [js, css] = await Promise.all([
  build({ ...common, entryPoints: [join(HERE, "src/main.js")], format: "esm", target: "es2022", platform: "browser" }),
  build({ ...common, entryPoints: [join(HERE, "src/style.css")] }),
]);
writeFileSync(join(HERE, `${NAME}.js`), js.outputFiles[0].contents);

const body = readFileSync(join(HERE, "src/page.html"), "utf8");
const html = `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="CADDi live pitch: a procedural CNC assembly walks through the Data Layer, Explorer, the Semantic Data Map and Workflow ROI, with Web Audio sound design.">
<link rel="icon" href="data:,">
<title>CADDi live pitch · Cutaway</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap">
<style>${css.outputFiles[0].text}</style>
</head>
<body>
${body}<script type="module" src="${NAME}.js"></script>
</body>
</html>
`;
const out = join(HERE, `${NAME}${theme === "light" ? "-light" : ""}.html`);
writeFileSync(out, html);
console.log(`Cutaway · ${NAME} (${theme}) → ${out}`);
