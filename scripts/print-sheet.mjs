// Printable sheets: pure functions that lay captured figure stills out as A4 or Letter pages.
// print.mjs captures the views and prints the PDF; this module only builds the HTML.

export const PAPER = {
  a4: { name: "A4", w: 210, h: 297, px: [794, 1123] },
  letter: { name: "Letter", w: 215.9, h: 279.4, px: [816, 1056] },
};
export const FORMATS = ["poster", "drawing", "detailed"];
export const TONES = ["hi", "mid", "lo", "dot"];
export const DIM = { hi: "#cdcdd1", mid: "#dcdce0", lo: "#e6e6e9", dot: "#d2d2d6" };
export const ON = { hi: "#000000", mid: "#2b2b2e", lo: "#55555a", dot: "#111113" };

const MARGIN = 12;
const PROJECT = "Cutaway";
const tenth = (value) => Math.round(value * 10) / 10;
const down = (value) => Math.floor(value * 10 + 1e-9) / 10;
const up = (value) => Math.ceil(value * 10 - 1e-9) / 10;
const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const two = (n) => String(n).padStart(2, "0");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// ---- crop geometry (viewBox units, boxes are [x, y, w, h]) ----

export function fitAspect([x, y, w, h], aspect) {
  let box = [x, y, w, h];
  if (w / h < aspect) box = [x - (h * aspect - w) / 2, y, h * aspect, h];
  else if (w / h > aspect) box = [x, y - (w / aspect - h) / 2, w, w / aspect];
  const x0 = down(box[0]);
  const y0 = down(box[1]);
  return [x0, y0, tenth(up(box[0] + box[2]) - x0), tenth(up(box[1] + box[3]) - y0)];
}

export function pad([x, y, w, h], share) {
  const extra = Math.max(w, h) * share;
  return [tenth(x - extra), tenth(y - extra), tenth(w + 2 * extra), tenth(h + 2 * extra)];
}

export function boxOf(view, ids, padBy = 0) {
  const found = ids.map((id) => view?.boxes?.[id]).filter(Boolean);
  if (!found.length) throw new Error(`no boxes for ${ids.join(", ")} in this view`);
  const x0 = Math.min(...found.map((b) => b[0]));
  const y0 = Math.min(...found.map((b) => b[1]));
  const x1 = Math.max(...found.map((b) => b[2]));
  const y1 = Math.max(...found.map((b) => b[3]));
  return pad([x0, y0, x1 - x0, y1 - y0], padBy);
}

export function frameOf(view) {
  if (view.raster) return view.raster.region;
  if (view.content) return pad(view.content, 0.02);
  return view.vb;
}

export function focusCrop(view, ids, aspect, frame, least = 0.42) {
  let [x, y, w, h] = boxOf(view, ids, 0.18);
  const widest = least * frame[2];
  if (w < widest) {
    x -= (widest - w) / 2;
    w = widest;
  }
  if (w / h < aspect) [x, w] = [x - (h * aspect - w) / 2, h * aspect];
  else [y, h] = [y - (w / aspect - h) / 2, w / aspect];
  if (w <= frame[2]) x = clamp(x, frame[0], frame[0] + frame[2] - w);
  if (h <= frame[3]) y = clamp(y, frame[1], frame[1] + frame[3] - h);
  return [tenth(x), tenth(y), tenth(w), tenth(h)];
}

// Spreads pins apart until no two are closer than minGap; pins without a close neighbour stay put.
export function relax(pins, minGap, rounds = 80) {
  const out = pins.map((pin) => ({ ...pin, pos: [...pin.at] }));
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i].pos;
        const b = out[j].pos;
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let distance = Math.hypot(dx, dy);
        if (distance >= minGap) continue;
        if (distance < 1e-9) {
          const turn = (i * 3 + j * 5 + 1) * 2.399963;
          [dx, dy, distance] = [Math.cos(turn), Math.sin(turn), 1];
        }
        const push = (minGap * 1.0001 - Math.hypot(b[0] - a[0], b[1] - a[1])) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        a[0] -= ux * push;
        a[1] -= uy * push;
        b[0] += ux * push;
        b[1] += uy * push;
        moved = true;
      }
    if (!moved) break;
  }
  return out;
}

// Stores identical layer markup once; each view refers to its layers by id.
export function layerTable(views) {
  const seen = new Map();
  const idFor = (markup) => {
    if (!seen.has(markup)) seen.set(markup, `pl${seen.size}`);
    return seen.get(markup);
  };
  const refs = Object.fromEntries(Object.entries(views).map(([name, view]) => [name, (view.layers ?? []).map(idFor)]));
  const defs = [...seen].map(([markup, id]) => `<g id="${id}">${markup}</g>`).join("");
  return { defs, refs };
}

export function detailedPlan(spec) {
  const slots = (spec.steps?.length ?? 0) + (spec.why ? 1 : 0);
  const stepPages = Math.max(1, Math.ceil(slots / 6));
  const cap = clamp(Math.round(spec.maxPages ?? 4), 2, 4);
  if (1 + stepPages > cap) throw new Error(`detailed sheet needs ${1 + stepPages} pages for its steps, over maxPages ${cap}; cut steps or raise maxPages`);
  const assemblyPages = Math.min(Math.ceil((spec.assemblies?.length ?? 0) / 4), cap - 1 - stepPages);
  return { stepPages, assemblyPages, total: 1 + stepPages + assemblyPages };
}

export function pagesOf(format, spec = {}) {
  return format === "detailed" ? detailedPlan(spec).total : 1;
}

// ---- stills ----

function useStyle(focus = [], hide = []) {
  let style = "";
  if (focus.length) for (const tone of TONES) style += `--cutaway-${tone}:${DIM[tone]};--part-${tone}:${DIM[tone]};`;
  for (const id of focus) for (const tone of TONES) style += `--on-${id}-${tone}:${ON[tone]};`;
  for (const id of hide) style += `--show-${id}:none;`;
  return style;
}

// One still. use: { view, layers?, focus?, hide? }; crop in viewBox units; widthMm is the printed width.
export function figure(ctx, use, { crop, widthMm, pins = [], marks = [], weight } = {}) {
  const view = ctx.capture.views[use.view];
  if (!view) throw new Error(`no captured view "${use.view}"`);
  const [cx, cy, cw, ch] = crop;
  const perMm = cw / widthMm;
  const line = weight ?? (widthMm >= 110 ? 0.6 : widthMm >= 60 ? 0.5 : 0.4);
  let body;
  if (view.raster) {
    const [rx, ry, rw, rh] = view.raster.region;
    body = `<image href="${view.raster.href}" x="${rx}" y="${ry}" width="${rw}" height="${rh}" preserveAspectRatio="none"/>`;
  } else {
    const refs = ctx.refs[use.view] ?? [];
    const chosen = use.layers ? use.layers.map((index) => refs[index]).filter(Boolean) : refs;
    const style = useStyle(use.focus ?? [], use.hide ?? []);
    body = chosen.map((id) => `<use href="#${id}"${style ? ` style="${style}"` : ""}/>`).join("");
  }
  const overlay = [];
  for (const mark of marks)
    overlay.push(`<circle class="ps-mark" cx="${tenth(mark.at[0])}" cy="${tenth(mark.at[1])}" r="${tenth(mark.r)}" style="stroke-dasharray:${tenth(1.2 * perMm)} ${tenth(0.9 * perMm)}"/>`);
  const spread = relax(pins, 4.4 * perMm);
  for (const pin of spread)
    if (Math.hypot(pin.pos[0] - pin.at[0], pin.pos[1] - pin.at[1]) > 1.2 * perMm)
      overlay.push(`<line class="ps-leader" x1="${tenth(pin.pos[0])}" y1="${tenth(pin.pos[1])}" x2="${tenth(pin.at[0])}" y2="${tenth(pin.at[1])}"/><circle class="ps-dot" cx="${tenth(pin.at[0])}" cy="${tenth(pin.at[1])}" r="${tenth(0.45 * perMm)}"/>`);
  const spans = spread.map((pin) => {
    const left = tenth(((pin.pos[0] - cx) / cw) * 100);
    const top = tenth(((pin.pos[1] - cy) / ch) * 100);
    return `<span class="${pin.letter ? "ps-pin ps-letter" : "ps-pin"}" style="left:${left}%;top:${top}%">${esc(pin.label)}</span>`;
  });
  return `<div class="ps-fig" style="aspect-ratio:${tenth(cw)} / ${tenth(ch)}"><svg class="iso-svg" viewBox="${crop.join(" ")}" preserveAspectRatio="xMidYMid meet" style="--cutaway-weight:${line}px">${body}${overlay.join("")}</svg>${spans.join("")}</div>`;
}

// ---- sheet ----

function context(capture, spec, paper) {
  const { defs, refs } = layerTable(capture.views);
  const parts = spec.parts ?? [];
  const named = parts.filter((part) => part.name);
  const number = new Map(named.map((part, index) => [part.id, index + 1]));
  const main = { view: Object.keys(capture.views)[0], ...(spec.main ?? {}) };
  const mainView = capture.views[main.view];
  if (!mainView) throw new Error(`main view "${main.view}" was not captured`);
  const mainCrop = main.crop ?? frameOf(mainView);
  return { capture, spec, paper, defs, refs, parts, named, number, main, mainView, mainCrop, innerW: paper.w - 2 * MARGIN, innerH: paper.h - 2 * MARGIN };
}

const aspectOf = (crop) => crop[2] / crop[3];
const fitWidth = (maxW, maxH, aspect) => Math.max(10, Math.min(maxW, maxH * aspect));

function partPins(ctx, view, ids, hide = []) {
  return ctx.named
    .filter((part) => (!ids || ids.includes(part.id)) && !hide.includes(part.id))
    .map((part) => ({ at: part.at ?? view.anchors?.[part.id], label: String(ctx.number.get(part.id)) }))
    .filter((pin) => Array.isArray(pin.at));
}

function stepCrop(ctx, item, aspect) {
  const view = ctx.capture.views[item.view];
  if (!view) throw new Error(`step view "${item.view}" was not captured`);
  if (item.crop) return item.crop;
  const frame = item.frame ?? (item.view === ctx.main.view ? ctx.mainCrop : frameOf(view));
  const around = item.around ?? item.focus ?? item.parts;
  if (around?.length && !view.raster && around.some((id) => view.boxes?.[id])) return focusCrop(view, around.filter((id) => view.boxes?.[id]), aspect, frame);
  return fitAspect(frame, aspect);
}

function mainFigure(ctx, maxW, maxH, { marks = [], letters = [] } = {}) {
  const width = fitWidth(maxW, maxH, aspectOf(ctx.mainCrop));
  const pins = [...partPins(ctx, ctx.mainView, null, ctx.main.hide ?? []), ...letters];
  const still = figure(ctx, ctx.main, { crop: ctx.mainCrop, widthMm: width, pins, marks });
  return `<div class="ps-area" style="--a:${aspectOf(ctx.mainCrop).toFixed(4)}">${still}</div>`;
}

function header(ctx, kicker) {
  const s = ctx.spec;
  const labels = [s.number && `No. ${s.number}`, kicker, s.tagline].filter(Boolean).map((text) => `<span>${esc(text)}</span>`).join("");
  return `<header class="ps-head"><div class="ps-label ps-tags">${labels}</div><h1 class="ps-name">${esc(s.name ?? s.title)}</h1></header>`;
}

function intro(ctx) {
  const s = ctx.spec;
  return `${s.question ? `<p class="ps-question">${esc(s.question)}</p>` : ""}${s.lead ? `<p class="ps-lead">${esc(s.lead)}</p>` : ""}`;
}

function numbers(ctx, row = false) {
  const list = ctx.spec.numbers ?? [];
  if (!list.length) return "";
  const cells = list.map(([value, unit, label]) => `<div class="ps-big"><b>${esc(value)}</b><i>${esc(unit)}</i><span>${esc(label)}</span></div>`).join("");
  return `<div class="ps-numbers${row ? " ps-row" : ""}">${cells}</div>`;
}

function legend(ctx, columns = 2) {
  if (!ctx.named.length) return "";
  const items = ctx.named.map((part) => `<li><b class="ps-no">${two(ctx.number.get(part.id))}</b><span><strong>${esc(part.name)}</strong>${part.say ? ` ${esc(part.say)}` : ""}</span></li>`).join("");
  return `<ol class="ps-legend" style="columns:${columns}">${items}</ol>`;
}

function partsList(ctx) {
  if (!ctx.named.length) return "";
  const items = ctx.named.map((part) => `<li><b class="ps-no">${two(ctx.number.get(part.id))}</b><span>${esc(part.name)}</span></li>`).join("");
  return `<section><h2 class="ps-label">Parts</h2><ol class="ps-parts">${items}</ol></section>`;
}

function specTable(ctx, columns = 1) {
  const rows = ctx.spec.spec ?? [];
  if (!rows.length) return "";
  const body = rows.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("");
  return `<section class="ps-specbox"><h2 class="ps-label">Specification</h2><dl class="ps-spec" style="columns:${columns}">${body}</dl></section>`;
}

function footer(ctx, left, right) {
  return `<footer class="ps-foot ps-label"><span>${left}</span><span>${right}</span></footer>`;
}

function poster(ctx) {
  const s = ctx.spec;
  const wide = aspectOf(ctx.mainCrop) > 1.15;
  const legendRows = Math.ceil(ctx.named.length / 2);
  const textH = 70 + legendRows * 8;
  const figureArea = wide
    ? `${mainFigure(ctx, ctx.innerW, ctx.innerH - textH - 22)}${numbers(ctx, true)}`
    : `<div class="ps-split">${numbers(ctx)}${mainFigure(ctx, ctx.innerW - 52, ctx.innerH - textH)}</div>`;
  return `<main class="ps ps-poster${wide ? " ps-wide" : ""}">${header(ctx, "How it works")}${intro(ctx)}${figureArea}${legend(ctx)}${footer(ctx, `${PROJECT}${s.quote ? ` · ${esc(s.quote)}` : ""}`, esc(ctx.paper.name))}</main>`;
}

function inset(ctx) {
  const item = ctx.spec.inset;
  if (!item?.view || !ctx.capture.views[item.view]) return "";
  const view = ctx.capture.views[item.view];
  const crop = item.crop ?? frameOf(view);
  const width = fitWidth(52, 50, aspectOf(crop));
  return `<section class="ps-inset"><h2 class="ps-label">${esc(item.label ?? "Inset")}</h2><div class="ps-inset-box" style="width:${tenth(width)}mm">${figure(ctx, { view: item.view, layers: item.layers, hide: item.hide }, { crop, widthMm: width })}</div></section>`;
}

function drawing(ctx) {
  const s = ctx.spec;
  const steps = s.steps ?? [];
  const cell = steps.length ? (ctx.innerW - 3 * (steps.length - 1)) / steps.length : 0;
  const strip = steps.length
    ? `<section class="ps-strip" style="grid-template-columns:repeat(${steps.length},1fr)">${steps.map((step, index) => {
        const crop = stepCrop(ctx, step, 1);
        const still = figure(ctx, step, { crop, widthMm: cell });
        return `<figure class="ps-step">${still}<figcaption><b class="ps-no">${two(index + 1)}</b> ${esc(step.title)}</figcaption></figure>`;
      }).join("")}</section>`
    : "";
  const top = `<header class="ps-drawhead"><div><div class="ps-label">${esc(s.kicker ?? "Explained drawing")}</div><h1 class="ps-title">${esc(s.title ?? s.name)}</h1></div><div class="ps-drawno ps-label"><span>Drawing</span><b>${esc(s.number ?? "")}</b></div></header>`;
  const side = `<aside class="ps-side">${partsList(ctx)}${specTable(ctx)}${inset(ctx)}</aside>`;
  const stripH = steps.length ? cell + 14 : 0;
  const body = `<div class="ps-split">${mainFigure(ctx, ctx.innerW - 62, ctx.innerH - 30 - stripH)}${side}</div>`;
  return `<main class="ps ps-drawing">${top}${body}${strip}${footer(ctx, `Not to scale · ${PROJECT}`, `${esc(ctx.paper.name)} · 1 / 1`)}</main>`;
}

function detailed(ctx) {
  const s = ctx.spec;
  const plan = detailedPlan(s);
  const total = plan.total;
  const pageFoot = (page) => footer(ctx, `${PROJECT} · ${esc(s.name ?? s.title ?? "")}`, `${esc(ctx.paper.name)} · ${page} / ${total}`);
  const pages = [];

  // Page 1: overview with lettered close-up marks.
  const details = s.details ?? [];
  const marks = [];
  const letters = [];
  const closeups = details.map((detail, index) => {
    const letter = String.fromCharCode(65 + index);
    const viewName = detail.view ?? ctx.main.view;
    if (viewName === ctx.main.view) {
      let circle;
      if (Array.isArray(detail.mark)) circle = { at: [detail.mark[0], detail.mark[1]], r: detail.mark[2] };
      else if (detail.around?.some((id) => ctx.mainView.boxes?.[id])) {
        const [x, y, w, h] = boxOf(ctx.mainView, detail.around.filter((id) => ctx.mainView.boxes?.[id]));
        circle = { at: [x + w / 2, y + h / 2], r: (Math.hypot(w, h) / 2) * 1.08 };
      }
      if (circle) {
        marks.push(circle);
        letters.push({ at: [circle.at[0] + circle.r * 0.72, circle.at[1] - circle.r * 0.72], label: letter, letter: true });
      }
    }
    const use = { view: viewName, layers: detail.layers ?? (viewName === ctx.main.view ? ctx.main.layers : undefined), hide: detail.hide ?? (viewName === ctx.main.view ? ctx.main.hide : undefined), focus: detail.focus };
    const crop = stepCrop(ctx, { ...use, crop: detail.crop, around: detail.around }, 1);
    const size = 34;
    return `<figure class="ps-close"><div class="ps-round" style="width:${size}mm">${figure(ctx, use, { crop, widthMm: size })}<span class="ps-pin ps-letter ps-tag">${letter}</span></div><figcaption><strong>${esc(detail.title)}</strong> ${esc(detail.text)}</figcaption></figure>`;
  });
  const closeRow = closeups.length ? `<section class="ps-closeups" style="grid-template-columns:repeat(${Math.min(closeups.length, 4)},1fr)">${closeups.join("")}</section>` : "";
  const legendRows = Math.ceil(ctx.named.length / 2);
  const overviewText = 92 + (closeups.length ? 52 : 0) + legendRows * 3;
  pages.push(`<main class="ps ps-detailed ps-overview">${header(ctx, "How it works")}${mainFigure(ctx, ctx.innerW, ctx.innerH - overviewText, { marks, letters })}${closeRow}<div class="ps-info"><div>${intro(ctx)}${numbers(ctx, true)}</div>${legend(ctx, 1)}</div>${pageFoot(1)}</main>`);

  // Step pages: six slots each, the why box in the slot after the last step.
  const slots = (s.steps ?? []).map((step, index) => {
    const crop = stepCrop(ctx, step, 1);
    const still = figure(ctx, step, { crop, widthMm: 58 });
    return `<article class="ps-slot">${still}<h3><b class="ps-no">${two(index + 1)}</b> ${esc(step.title)}</h3><p>${esc(step.text)}</p></article>`;
  });
  if (s.why) slots.push(`<article class="ps-slot ps-why"><h3>${esc(s.why.title ?? "Why?")}</h3><p>${esc(s.why.text)}</p></article>`);
  const last = 1 + plan.stepPages + plan.assemblyPages;
  for (let page = 0; page < plan.stepPages; page++) {
    const number = 2 + page;
    const chunk = slots.slice(page * 6, page * 6 + 6).join("");
    const closing = number === last ? specTable(ctx, 2) : "";
    pages.push(`<main class="ps ps-detailed ps-steps"><header class="ps-pagehead"><span class="ps-label">How it works</span><h2>${esc(s.name ?? s.title ?? "")}</h2></header><section class="ps-slots">${chunk}</section>${closing}${pageFoot(number)}</main>`);
  }

  // Assembly pages: up to four lit close-ups each, with only their own pins.
  const assemblies = (s.assemblies ?? []).slice(0, plan.assemblyPages * 4);
  for (let page = 0; page < plan.assemblyPages; page++) {
    const number = 2 + plan.stepPages + page;
    const cards = assemblies.slice(page * 4, page * 4 + 4).map((item) => {
      const use = { view: item.view ?? ctx.main.view, layers: item.layers ?? (item.view ? undefined : ctx.main.layers), hide: item.hide ?? (item.view ? undefined : ctx.main.hide), focus: item.parts };
      const view = ctx.capture.views[use.view];
      const crop = stepCrop(ctx, { ...use, crop: item.crop, around: item.parts }, 1.1);
      const pins = view ? partPins(ctx, view, item.parts, use.hide ?? []) : [];
      const listed = (item.parts ?? []).filter((id) => ctx.number.has(id)).map((id) => two(ctx.number.get(id))).join(" · ");
      return `<article class="ps-assembly">${figure(ctx, use, { crop, widthMm: 86, pins })}<h3>${esc(item.title)}</h3><p>${esc(item.text)}</p>${listed ? `<div class="ps-label">Parts ${listed}</div>` : ""}</article>`;
    });
    const closing = number === last ? specTable(ctx, 2) : "";
    pages.push(`<main class="ps ps-detailed ps-assemblies"><header class="ps-pagehead"><span class="ps-label">Assemblies</span><h2>${esc(s.name ?? s.title ?? "")}</h2></header><section class="ps-cards">${cards.join("")}</section>${closing}${pageFoot(number)}</main>`);
  }
  return pages.join("");
}

function sheetCss(paper) {
  const w = paper.w;
  const h = paper.h;
  return [
    `@page{size:${w}mm ${h}mm;margin:0}`,
    "html,body{margin:0;padding:0}",
    "body.iso{background:#e4e4e1;color:#111;font-family:\"Helvetica Neue\",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    `.ps{box-sizing:border-box;width:${w}mm;height:${h}mm;margin:6mm auto;padding:${MARGIN}mm;background:#fff;display:flex;flex-direction:column;gap:3.2mm;position:relative;break-after:page;overflow:visible;font-size:3mm;line-height:1.38}`,
    ".ps:last-of-type{break-after:auto}",
    "html.ps-bare body.iso{background:#fff}html.ps-bare .ps{margin:0}",
    "@media print{body.iso{background:#fff}.ps{margin:0}}",
    ".ps h1,.ps h2,.ps h3,.ps p,.ps ol,.ps dl,.ps figure{margin:0;padding:0}",
    ".ps-label{font-family:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace;font-size:2.1mm;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#4a4a4f;line-height:1.3}",
    ".ps-tags{display:flex;gap:4mm}",
    ".ps-name{font-size:13mm;line-height:1;font-weight:700;letter-spacing:-.02em;margin-top:1.5mm}",
    ".ps-title{font-size:6mm;line-height:1.1;font-weight:700;margin-top:1mm}",
    ".ps-question{font-size:4.6mm;font-weight:600;line-height:1.2}",
    ".ps-lead{font-size:3.2mm;color:#2a2a2d;max-width:170mm}",
    ".ps-area{flex:1 1 0;min-height:55mm;container-type:size;display:flex;align-items:center;justify-content:center}",
    ".ps-area>.ps-fig{width:min(100cqw,calc(100cqh * var(--a)))}",
    ".ps-fig{position:relative;width:100%}",
    ".ps-fig>svg.iso-svg{display:block;width:100%;height:100%;overflow:hidden}",
    ".ps-mark{fill:none;stroke:#000;stroke-width:.6px;vector-effect:non-scaling-stroke}",
    ".ps-leader{stroke:#000;stroke-width:.4px;vector-effect:non-scaling-stroke}",
    ".ps-dot{fill:#000;stroke:none}",
    ".ps-pin{position:absolute;transform:translate(-50%,-50%);min-width:3.8mm;height:3.8mm;border-radius:1.9mm;background:#000;color:#fff;font:700 2.2mm/3.8mm \"Helvetica Neue\",Helvetica,Arial,sans-serif;text-align:center;padding:0 .6mm;box-sizing:border-box}",
    ".ps-letter{background:#fff;color:#000;border:.25mm solid #000;line-height:3.3mm}",
    ".ps-split{flex:1 1 0;min-height:0;display:flex;gap:6mm;align-items:stretch}",
    ".ps-split>.ps-area{min-width:0}",
    ".ps-numbers{display:flex;flex-direction:column;gap:3mm;width:46mm;flex:none;justify-content:center}",
    ".ps-numbers.ps-row{flex-direction:row;flex-wrap:wrap;width:auto;gap:3mm 7mm;justify-content:flex-start}",
    ".ps-big{display:grid;grid-template-columns:auto 1fr;column-gap:1.2mm;align-items:baseline}",
    ".ps-big b{font-size:9mm;line-height:1;font-weight:700;letter-spacing:-.02em}",
    ".ps-row .ps-big b{font-size:6.5mm}",
    ".ps-big i{font-style:normal;font-size:3.2mm;font-weight:600}",
    ".ps-big span{grid-column:1/-1;font-size:2.5mm;color:#4a4a4f}",
    ".ps-legend{list-style:none;column-gap:7mm;font-size:2.7mm;line-height:1.3}",
    ".ps-legend li,.ps-parts li{display:flex;gap:2mm;break-inside:avoid;padding:.8mm 0;border-top:.15mm solid #d6d6d9}",
    ".ps-no{font-family:ui-monospace,Menlo,monospace;font-size:2.3mm;font-weight:700;min-width:4.5mm}",
    ".ps-foot{display:flex;justify-content:space-between;border-top:.15mm solid #000;padding-top:1.6mm;margin-top:auto}",
    ".ps-drawhead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.3mm solid #000;padding-bottom:2mm}",
    ".ps-drawno{display:flex;flex-direction:column;align-items:flex-end;border:.2mm solid #000;padding:1.2mm 2mm}",
    ".ps-drawno b{font-size:4mm;color:#000}",
    ".ps-side{width:56mm;flex:none;display:flex;flex-direction:column;gap:3.5mm;font-size:2.6mm}",
    ".ps-parts{list-style:none;margin-top:1mm}",
    ".ps-spec{margin-top:1mm;column-gap:7mm}",
    ".ps-spec div{display:flex;justify-content:space-between;gap:3mm;padding:.7mm 0;border-top:.15mm solid #d6d6d9;break-inside:avoid}",
    ".ps-spec dt{color:#4a4a4f}.ps-spec dd{margin:0;font-weight:600;text-align:right}",
    ".ps-inset-box{border:.15mm solid #d6d6d9;margin-top:1mm}",
    ".ps-strip{display:grid;gap:3mm;border-top:.15mm solid #000;padding-top:2.5mm}",
    ".ps-step figcaption{font-size:2.5mm;line-height:1.25;margin-top:1mm}",
    ".ps-closeups{display:grid;gap:5mm}",
    ".ps-close{display:flex;gap:2.5mm;align-items:flex-start;font-size:2.5mm;line-height:1.3}",
    ".ps-round{position:relative;flex:none;border-radius:50%;border:.25mm dashed #000;overflow:visible}",
    ".ps-round>.ps-fig{border-radius:50%;overflow:hidden}",
    ".ps-tag{left:14%;top:14%}",
    ".ps-info{display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:start}",
    ".ps-info>div{display:flex;flex-direction:column;gap:2.5mm}",
    ".ps-pagehead{display:flex;flex-direction:column;gap:1mm;border-bottom:.3mm solid #000;padding-bottom:2mm}",
    ".ps-pagehead h2{font-size:6mm;line-height:1.1}",
    ".ps-slots{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,auto);gap:5mm;align-content:start}",
    ".ps-slot h3{font-size:3.4mm;margin-top:2mm;line-height:1.2}",
    ".ps-slot p{font-size:2.8mm;margin-top:1mm}",
    ".ps-why{border:.25mm solid #000;padding:4mm;align-self:start}",
    ".ps-why h3{margin-top:0}",
    ".ps-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm;align-content:start}",
    ".ps-assembly h3{font-size:3.6mm;margin-top:2mm}",
    ".ps-assembly p{font-size:2.8mm;margin:1mm 0}",
    ".ps-specbox{margin-top:auto}",
    ".ps-specbox+.ps-foot{margin-top:0}",
  ].join("\n");
}

export function sheetHtml(capture, spec, paper = PAPER.a4, format = spec.format ?? "poster") {
  if (!FORMATS.includes(format)) throw new Error(`unknown format "${format}"; use one of ${FORMATS.join(", ")}`);
  const ctx = context(capture, spec, paper);
  const pages = format === "poster" ? poster(ctx) : format === "drawing" ? drawing(ctx) : detailed(ctx);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(spec.title ?? spec.name ?? "Sheet")}</title>`,
    '<script>if(/(^|[?&])print(=|&|$)/.test(location.search.slice(1)))document.documentElement.classList.add("ps-bare")</script>',
    `<style>${capture.css ?? ""}</style>`,
    `<style>${sheetCss(paper)}</style>`,
    "</head>",
    '<body class="iso" data-theme="light">',
    `<svg class="iso-svg" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${ctx.defs}</defs></svg>`,
    pages,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
