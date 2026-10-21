const root = document.documentElement;
let theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
try { const saved = localStorage.getItem("cutaway-theme"); if (["light", "dark"].includes(saved)) theme = saved; } catch {}
let catalog = [];
let filter = "All";
let activeStudy = null;
let sourceRequest;
const gallery = document.querySelector("[data-gallery]");
const dialog = document.querySelector("[data-source-dialog]");
const base = new URL("./", import.meta.url);
const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const page = (item) => new URL(`examples/${item.id}/${item.id}${theme === "light" ? "-light" : ""}.html`, base).href;

function toast(text) {
  const el = document.querySelector("[data-toast]");
  if (!el) return;
  el.textContent = text;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2500);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0";
    document.body.append(area);
    area.select();
    const success = document.execCommand("copy");
    area.remove();
    if (!success) return toast("Copy unavailable. Select the command to copy it.");
  }
  toast("Copied. Make something understandable.");
}

function setTheme(value) {
  theme = value;
  root.dataset.theme = theme;
  for (const button of document.querySelectorAll("[data-theme-toggle]")) {
    button.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} theme`);
    button.innerHTML = `◐ <span>${theme === "light" ? "Dark" : "Light"}</span>`;
  }
  try { localStorage.setItem("cutaway-theme", theme); } catch {}
  const hero = document.querySelector("[data-hero-frame]");
  const heroItem = { id: "multi-agent-orchestration" };
  if (hero) hero.src = page(heroItem) + "?embed&hero&open=1";
  const link = document.querySelector("[data-hero-link]");
  if (link) link.href = page(heroItem);
  for (const frame of document.querySelectorAll("[data-theme-frame]")) {
    const url = page({ id: frame.dataset.themeFrame });
    if (frame.src !== url) frame.src = url;
  }
  for (const anchor of document.querySelectorAll("[data-theme-link]")) anchor.href = page({ id: anchor.dataset.themeLink });
  if (gallery && catalog.length) renderGallery();
}

function renderGallery() {
  const items = catalog.filter((item) => filter === "All" || item.kind === filter);
  gallery.innerHTML = items.map((item) => `<article class="gallery-card"><div class="study-preview"><img src="${new URL(`media/${item.id}-${theme}-poster.png`, base)}" alt="${escape(item.title)} isometric study, ${theme} theme" loading="lazy" width="760" height="540"><span class="study-number">${String(catalog.indexOf(item) + 1).padStart(2, "0")} / ${escape(item.category).toUpperCase()}</span><button type="button" class="study-play" data-play-study="${item.id}">Play study ↗</button></div><div class="study-heading"><h3>${escape(item.title)}</h3><span class="mode-tag">${escape(item.kind)}${item.kind === "3D" ? " / BETA" : ""}</span></div><p>${escape(item.description)}</p><div class="study-actions"><button type="button" data-inspect="${item.id}" data-tab="prompt">Prompt ↗</button><button type="button" data-inspect="${item.id}" data-tab="source">Source ↗</button><a href="${page(item)}" target="_blank" rel="noopener">Open full study ↗</a></div></article>`).join("");
  [...gallery.querySelectorAll(".study-actions")].forEach((actions, index) => {
    const clip = document.createElement("a");
    clip.href = new URL(`media/${items[index].id}-light.mp4`, base).href;
    clip.textContent = "Video ↗";
    clip.title = "Recorded light-theme preview";
    clip.target = "_blank";
    clip.rel = "noopener";
    actions.insertBefore(clip, actions.lastElementChild);
  });
  document.querySelector("[data-count]").textContent = `${items.length} ${items.length === 1 ? "STUDY" : "STUDIES"}`;
}

async function showSource(tab) {
  if (!activeStudy) return;
  sourceRequest?.abort();
  sourceRequest = new AbortController();
  const study = activeStudy;
  document.querySelector("#source-title").textContent = study.title;
  document.querySelectorAll("[data-source-tab]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.sourceTab === tab)));
  const text = document.querySelector("[data-source-content]");
  const provenance = document.querySelector("[data-provenance]");
  const link = document.querySelector("[data-source-link]");
  const url = tab === "html" ? page(study) : new URL(`examples/${study.id}/${study.source}`, base).href;
  link.href = url;
  provenance.textContent = study.provenance ?? "Implementation brief supplied for this project. The recipe below reproduces its scope; source was implemented and audited in the repository.";
  if (tab === "prompt") {
    text.textContent = `${study.promptType}\n\n${study.prompt}${study.recipe ? `\n\nCopyable recipe\n\n${study.recipe}` : ""}`;
    return;
  }
  text.textContent = "Loading source…";
  try {
    const response = await fetch(url, { signal: sourceRequest.signal });
    if (!response.ok) throw new Error(`Source unavailable (${response.status})`);
    const source = await response.text();
    if (activeStudy === study) text.textContent = source;
  } catch (error) { if (error.name !== "AbortError") text.textContent = error.message; }
}

document.addEventListener("click", (event) => {
  const themeButton = event.target.closest("[data-theme-toggle]");
  if (themeButton) return setTheme(theme === "light" ? "dark" : "light");
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) return copy(copyButton.dataset.copy);
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    filter = filterButton.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button === filterButton)));
    renderGallery();
    return;
  }
  const play = event.target.closest("[data-play-study]");
  if (play) {
    const item = catalog.find((entry) => entry.id === play.dataset.playStudy);
    const preview = play.closest(".study-preview");
    const frame = document.createElement("iframe");
    frame.src = page(item) + "?embed";
    frame.title = `Interactive ${item.title}`;
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    preview.replaceChildren(frame);
    preview.classList.add("is-playing");
    return;
  }
  const inspect = event.target.closest("[data-inspect]");
  if (inspect) {
    activeStudy = catalog.find((item) => item.id === inspect.dataset.inspect);
    dialog.showModal();
    showSource(inspect.dataset.tab);
  }
  const tab = event.target.closest("[data-source-tab]");
  if (tab) showSource(tab.dataset.sourceTab);
  if (event.target.closest("[data-close-dialog]") || event.target === dialog) dialog?.close();
});
dialog?.addEventListener("close", () => sourceRequest?.abort());

setTheme(theme);
if (gallery) {
  try {
    const response = await fetch(new URL("catalog.json", base));
    if (!response.ok) throw new Error(`Gallery unavailable (${response.status})`);
    catalog = await response.json();
    renderGallery();
  } catch (error) { gallery.textContent = `${error.message}. Open the examples directly or visit the documentation.`; }
}

const playground = document.querySelector("[data-playground]");
if (playground) {
  const form = playground.querySelector("form");
  const output = playground.querySelector("[data-prompt-output]");
  const update = () => {
    const data = new FormData(form);
    const trigger = data.get("agent") === "codex" ? "$cutaway" : "/cutaway";
    const text = `${trigger} explain ${data.get("system") || "my system"} as ${data.get("view")}. Use ${data.get("mode")}. Let readers ${data.get("interaction") || "open layers and step the model"}. Deliver standalone HTML in light and dark themes. Drive the readout from the same model; include keyboard controls, reduced motion, and visual audits.`;
    output.textContent = text;
    playground.querySelector("[data-copy-prompt]").dataset.copy = text;
  };
  form.addEventListener("input", update);
  form.addEventListener("submit", (event) => { event.preventDefault(); copy(output.textContent); });
  update();
}
