import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".md": "text/plain; charset=utf-8", ".ts": "text/plain; charset=utf-8", ".tsx": "text/plain; charset=utf-8" };
export function serve({ port = Number(process.env.PORT ?? 4321), root = resolve("dist"), log = true } = {}) {
if (!existsSync(resolve(root, "index.html"))) throw new Error("Build the site first: npm run build:site");
return createServer((request, response) => {
  let path;
  try { path = resolve(root, "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname)); }
  catch { response.writeHead(400).end("Bad request"); return; }
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end("Forbidden"); return; }
  if (existsSync(path) && statSync(path).isDirectory()) {
    if (!new URL(request.url, "http://localhost").pathname.endsWith("/")) { response.writeHead(302, { Location: request.url.split("?")[0] + "/" }).end(); return; }
    path = resolve(path, "index.html");
  }
  if (!existsSync(path) || !statSync(path).isFile()) { response.writeHead(404).end("Not found"); return; }
  response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  if (request.method === "HEAD") response.end();
  else createReadStream(path).pipe(response);
}).listen(port, "127.0.0.1", function () { if (log) console.log(`Cutaway · Local: http://127.0.0.1:${this.address().port}`); });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
