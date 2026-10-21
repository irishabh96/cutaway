import assert from "node:assert/strict";
import test from "node:test";
import { FORMATS, PAPER, boxOf, detailedPlan, fitAspect, focusCrop, layerTable, pagesOf, relax, sheetHtml } from "./print-sheet.mjs";
import { captureScript } from "./print.mjs";

const tones = ["hi", "mid", "lo", "dot"];
const partGroup = (id, d) => `<g data-print-part="${id}" style="${tones.map((tone) => `--cutaway-${tone}:var(--on-${id}-${tone},var(--part-${tone},currentColor))`).join(";")};display:var(--show-${id},inline)"><path class="iso-line" d="${d}"/></g>`;
const shared = '<rect class="iso-fill" x="0" y="0" width="400" height="600"/>';
const boxes = { pump: [100, 100, 180, 160], bell: [120, 300, 260, 520], frame: [20, 20, 380, 580] };
const anchors = { pump: [140, 130], bell: [190, 410], frame: [200, 300] };
const view = (second) => ({ vb: [0, 0, 400, 600], content: [10, 10, 380, 580], layers: [shared, second], boxes, anchors, k: 1, offset: [0, 0], readout: "", raster: null });

const capture = {
  views: {
    rest: view(partGroup("pump", "M100 100L180 160") + partGroup("bell", "M120 300L260 520") + partGroup("frame", "M20 20L380 580")),
    apart: view(partGroup("pump", "M100 90L180 150") + partGroup("bell", "M120 310L260 530")),
    fire: { vb: [0, 0, 400, 600], content: null, layers: [], boxes: {}, anchors: {}, k: 1, offset: [0, 0], readout: "", raster: { region: [50, 50, 300, 400], href: "data:image/png;base64,AAAA" } },
  },
  css: ".iso-line{stroke:var(--cutaway-lo)}",
};

const spec = {
  name: "Pump",
  title: "Pump: how it moves water",
  number: "CW-099",
  tagline: "A test figure",
  question: "How does it move water?",
  lead: "A short lead.",
  quote: "Water goes up",
  numbers: [["12", "L/min", "flow"], ["3", "bar", "head"]],
  spec: [["Flow", "12 L/min"], ["Head", "3 bar"]],
  why: { title: "Why?", text: "Because." },
  parts: [
    { id: "pump", name: "Pump", say: "Pushes the water.", select: '[data-name^="pump"]' },
    { id: "bell", name: "Bell", say: "Shapes the jet.", select: ".bell" },
    { id: "frame", select: ".frame" },
  ],
  main: { view: "apart" },
  inset: { label: "Assembled", view: "rest" },
  steps: [
    { view: "rest", title: "Pump", text: "It pumps.", focus: ["pump"] },
    { view: "apart", title: "Bell", text: "It shapes.", focus: ["bell"], hide: ["frame"] },
    { view: "fire", title: "Fire", text: "It fires." },
  ],
  details: [{ title: "Pump", text: "Close up.", around: ["pump"], focus: ["pump"] }],
};

const count = (text, needle) => text.split(needle).length - 1;

test("fitAspect reaches the aspect and keeps the box inside", () => {
  const box = [10, 20, 100, 50];
  for (const aspect of [0.5, 1, 2.4]) {
    const [x, y, w, h] = fitAspect(box, aspect);
    assert.ok(Math.abs(w / h - aspect) < 0.01, `${aspect}: ${w / h}`);
    assert.ok(x <= box[0] && y <= box[1] && x + w >= box[0] + box[2] && y + h >= box[1] + box[3]);
  }
});

test("boxOf unites part boxes and refuses unknown parts", () => {
  assert.deepEqual(boxOf({ boxes }, ["pump", "bell"]), [100, 100, 160, 420]);
  assert.throws(() => boxOf({ boxes }, ["nothing"]), /no boxes/);
});

test("focusCrop frames the part inside the view", () => {
  const frame = [0, 0, 400, 600];
  const [x, y, w, h] = focusCrop({ boxes }, ["pump"], 1, frame);
  assert.ok(Math.abs(w / h - 1) < 0.01);
  assert.ok(x >= -0.1 && y >= -0.1 && x + w <= 400.1 && y + h <= 600.1);
  assert.ok(x <= 100 && x + w >= 180);
});

test("relax spreads crowded pins and leaves lone ones alone", () => {
  const out = relax([{ at: [50, 50] }, { at: [50.5, 50] }, { at: [50, 50.8] }, { at: [100, 100] }], 10);
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(out[i].pos[0] - out[j].pos[0], out[i].pos[1] - out[j].pos[1]) >= 9.99);
  assert.deepEqual(out[3].pos, [100, 100]);
});

test("layerTable stores shared layers once", () => {
  const { defs, refs } = layerTable(capture.views);
  assert.equal(refs.rest[0], refs.apart[0]);
  assert.notEqual(refs.rest[1], refs.apart[1]);
  assert.equal(count(defs, '<g id="pl'), 3);
});

for (const format of FORMATS)
  test(`${format} sheet has its pages, pins and no outside resources`, () => {
    const html = sheetHtml(capture, spec, PAPER.a4, format);
    assert.equal(count(html, '<main class="ps '), pagesOf(format, spec));
    assert.match(html, /@page\{size:210mm 297mm/);
    assert.deepEqual([...html.matchAll(/class="ps-pin" style="[^"]*">(\d+)</g)].map((match) => match[1]), ["1", "2"]);
    assert.ok(html.includes("Pump") && html.includes("Bell"));
    assert.doesNotMatch(html.replace(/xmlns(:\w+)?="[^"]*"/g, ""), /https?:\/\//);
  });

test("drawing lights focus parts, hides parts and embeds rasters", () => {
  const html = sheetHtml(capture, spec, PAPER.a4, "drawing");
  assert.match(html, /style="[^"]*--part-hi:#cdcdd1;[^"]*--on-pump-hi:#000000/);
  assert.match(html, /style="[^"]*--on-bell-hi:#000000;[^"]*--show-frame:none/);
  assert.match(html, /<image href="data:image\/png;base64,AAAA" x="50" y="50" width="300" height="400"/);
});

test("detailed sheet marks its close-ups and says why", () => {
  const html = sheetHtml(capture, spec, PAPER.a4, "detailed");
  assert.match(html, /class="ps-mark"/);
  assert.match(html, /class="[^"]*ps-letter[^"]*"[^>]*>A</);
  assert.ok(html.includes("Because."));
});

test("Letter paper and unknown formats", () => {
  assert.match(sheetHtml(capture, spec, PAPER.letter, "poster"), /@page\{size:215\.9mm 279\.4mm/);
  assert.throws(() => sheetHtml(capture, spec, PAPER.a4, "zine"), /unknown format/);
});

test("captureScript is one expression carrying only selected parts", () => {
  const script = captureScript({ parts: [{ id: "pump", select: '[data-name^="pump"]' }, { id: "x", name: "X" }], strip: [".glow"] });
  assert.doesNotThrow(() => new Function(`return ${script}`));
  assert.ok(script.includes('[data-name^=\\"pump\\"]'));
  assert.ok(script.includes(".glow"));
  assert.ok(!script.includes('"id":"x"'));
});

test("detailed page plan and assembly pages", () => {
  const steps = (n) => Array.from({ length: n }, (_, index) => ({ view: "rest", title: `Step ${index}`, text: "" }));
  const assemblies = (n) => Array.from({ length: n }, (_, index) => ({ title: `Group ${index}`, text: "", parts: ["pump"] }));
  assert.equal(detailedPlan({ steps: steps(5), why: { text: "" } }).total, 2);
  assert.equal(detailedPlan({ steps: steps(5), assemblies: assemblies(4) }).total, 3);
  assert.equal(detailedPlan({ steps: steps(9), assemblies: assemblies(4) }).total, 4);
  assert.equal(detailedPlan({ steps: steps(9), assemblies: assemblies(8) }).total, 4);
  assert.equal(detailedPlan({ steps: steps(5), assemblies: assemblies(4), maxPages: 2 }).total, 2);
  assert.throws(() => detailedPlan({ steps: steps(19) }), /over maxPages/);
  const html = sheetHtml(capture, { ...spec, assemblies: [{ title: "The pump side", text: "Pump and bell.", parts: ["pump", "bell"] }] }, PAPER.a4, "detailed");
  assert.equal(count(html, '<main class="ps '), 3);
  assert.ok(html.includes("Assemblies") && html.includes("1 / 3"));
});
