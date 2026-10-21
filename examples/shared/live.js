const stage = document.querySelector(".lab-stage");
const rig = document.querySelector("[data-rig]");
const parts = [...rig.children];
const still = matchMedia("(prefers-reduced-motion: reduce)");
let state = createModel(CONFIG.parameter.value);
let paused = still.matches;
let visible = true;
let open = new URLSearchParams(location.search).get("open") === "1" ? 1 : 0;
let target = open;
let previous = null;
const play = document.querySelector("[data-play]");
const readout = document.querySelector("[data-readout]");
const metrics = [...document.querySelectorAll("[data-metric]")];
const inspector = document.querySelector("[data-inspector]");

function paint() {
  const view = snapshot(state);
  readout.textContent = view.readout;
  view.metrics.forEach((value, index) => { metrics[index].textContent = value; });
  document.querySelectorAll("[data-token]").forEach((light) => { light.style.opacity = 0.12 + 0.88 * Math.max(0, Math.min(1, view.tokens - Number(light.dataset.token))); });
  document.querySelectorAll("[data-task]").forEach((light) => { light.style.opacity = view.completed > Number(light.dataset.task) ? 1 : 0.12; });
  for (const part of parts) {
    const layer = Number(part.dataset.layer);
    const share = layer < 0 ? 0 : open;
    part.setAttribute("transform", `translate(${Number(part.dataset.dx) * share} ${Number(part.dataset.dy) * share})`);
    part.querySelector(".iso-solid")?.toggleAttribute("data-lit", view.active.includes(Number(part.dataset.node)));
  }
  const sorted = parts.slice().sort((a, b) => Number(a.dataset.key) + Number(a.dataset.lift) * open - Number(b.dataset.key) - Number(b.dataset.lift) * open);
  if (sorted.some((part, index) => rig.children[index] !== part)) rig.append(...sorted);
  play.textContent = paused ? "Play" : "Pause";
  play.setAttribute("aria-pressed", String(!paused));
}

function setOpen(value) {
  target = Math.max(0, Math.min(1, value));
  if (still.matches) open = target;
  document.querySelector("[data-open]").setAttribute("aria-pressed", String(target > 0));
  document.querySelector("[data-open]").firstChild.textContent = target > 0 ? "Close layers " : "Open layers ";
  paint();
}

function reset() {
  state = createModel(Number(document.querySelector("[data-parameter]").value));
  paint();
}

document.querySelector("[data-open]").addEventListener("click", () => setOpen(target ? 0 : 1));
play.addEventListener("click", () => { paused = !paused; paint(); });
document.querySelector("[data-step]").addEventListener("click", () => { paused = true; advance(state, 1); paint(); });
document.querySelector("[data-reset]").addEventListener("click", reset);
document.querySelectorAll("[data-inspect-node]").forEach((button) => button.addEventListener("click", () => { inspector.textContent = CONFIG.details[Number(button.dataset.inspectNode)]; setOpen(1); }));
document.querySelector("[data-parameter]").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  setParameter(state, value);
  document.querySelector("[data-parameter-value]").textContent = value;
  paint();
});
stage.addEventListener("pointermove", (event) => {
  const node = event.target.closest("[data-node]");
  const index = Number(node?.dataset.node ?? -1);
  if (index >= 0) inspector.textContent = CONFIG.details[index];
});
stage.addEventListener("keydown", (event) => {
  if (![" ", "ArrowLeft", "ArrowRight", "n", "N", "r", "R"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === " ") paused = !paused;
  else if (event.key === "ArrowRight") setOpen(1);
  else if (event.key === "ArrowLeft") setOpen(0);
  else if (event.key.toLowerCase() === "n") { paused = true; advance(state, 1); }
  else reset();
  paint();
});
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);
still.addEventListener("change", () => { if (still.matches) { paused = true; open = target; paint(); } });
window.__cutaway = {
  reset,
  step(seconds = 1) { paused = true; advance(state, seconds); paint(); },
  open(value = 1) { setOpen(value); },
  pause(value = true) { paused = value; paint(); },
  get state() { return snapshot(state); },
};
function frame(now) {
  const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (visible && !document.hidden) {
    if (!paused && !still.matches) advance(state, dt);
    if (!still.matches) open += (target - open) * (1 - Math.exp(-dt * 7));
    if (!paused || Math.abs(target - open) > 0.0001) paint();
  }
  requestAnimationFrame(frame);
}
paint();
if (new URLSearchParams(location.search).has("hero")) document.body.classList.add("iso-hero");
setOpen(target);
requestAnimationFrame(frame);
