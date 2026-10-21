// Printable sheets for the arcade cabinet: node scripts/print.mjs examples/arcade-cabinet/sheet.mjs --format all
// The views run in order on one page with the clock live (reduced: false), so the coin really rolls.
const named = (...prefixes) => prefixes.map((prefix) => `[data-name^="${prefix}"]`).join(", ");
// Crops in viewBox units, so the coin path is not stretched to take in the tray of quarters.
const CHUTE_CROP = [250, 466, 124, 124];
const hasCoin = (phase) => `document.querySelector('[data-part="${phase}"]').innerHTML.length > 0`;

export default {
  page: "arcade-cabinet-light.html",
  out: "arcade-cabinet",
  reduced: false,
  views: {
    off: { actions: [["key", "Escape"], ["wait", 600]] },
    rolling: { actions: [["key", "c"], ["wait", 1450], ["slow", 0.03], ["until", hasCoin("coin-chute"), 30000]] },
    falling: { actions: [["until", hasCoin("coin-fall"), 30000], ["wait", 100]] },
    test: { actions: [["slow", 1], ["until", `document.querySelector("[data-readout]").textContent.includes("RAM OK")`, 15000]] },
    attract: { actions: [["wait", 6500]] },
  },
  name: "Arcade cabinet",
  title: "How a coin starts the game",
  number: "CW-002",
  tagline: "Upright, 1981 style",
  question: "What happens when you drop in a coin?",
  lead: "The quarter rolls through a mech that checks it, then falls past a thin switch wire into the cash box. That one pulse counts the coin, latches the power on, warms the picture tube, tests the board and starts attract mode.",
  quote: "One wire, one pulse, one credit",
  numbers: [
    ["178", "cm", "cabinet height"],
    ["24.26", "mm", "a US quarter"],
    ["27", "cm", "drop into the cash box"],
    ["224 × 288", "px", "picture, on its side"],
    ["15.734", "kHz", "line rate"],
  ],
  spec: [
    ["Style", "Upright, 1981"],
    ["Height", "178 cm"],
    ["Coin", "US quarter, 24.26 mm"],
    ["Drop", "27 cm into the cash box"],
    ["Picture", "224 × 288, on its side"],
    ["Line rate", "15.734 kHz"],
    ["Warm-up", "About 2 s"],
  ],
  why: {
    title: "Why is the screen on its side?",
    text: "The game is taller than it is wide, so the monitor is mounted on its side. Its scan lines run up and down the glass, and at power-off the picture collapses to a vertical line.",
  },
  parts: [
    { id: "door", name: "Coin door and slot", say: "The quarter goes in here; a reject comes back out of the return.", select: named("door") },
    { id: "mech", name: "Coin mech", say: "Checks the coin's size and metal before letting it through.", select: named("mech") },
    { id: "switch", name: "Coin switch", say: "A thin wire the falling coin brushes: one pulse per coin.", select: named("coin.switch") },
    { id: "chute", name: "Coin chute", say: "A 30° slope that carries the coin past the switch.", select: named("chute") },
    { id: "cash", name: "Cash box", say: "An open box 27 cm below the chute that catches every coin.", select: named("cash") },
    { id: "meter", name: "Coin meter", say: "Counts each coin, pulsed by the switch.", select: named("meter", "wire.meter") },
    { id: "power", name: "Relay, transformer and supply", say: "The first coin latches the relay and wakes the cabinet.", select: named("relay", "xfmr", "psu", "fuse", "pw.", "cable.power") },
    { id: "pcb", name: "Game board", say: "CPU, RAM and ROMs: it tests itself, then runs the game.", select: named("pcb") },
    { id: "harness", name: "Harness and edge connector", say: "Carries the coin line, the controls and the video to the board.", select: named("loom", "cable.video", "wire.coin") },
    { id: "monitor", name: "Monitor, CRT and chassis", say: "On its side for a vertical game; it warms up in about 2 s.", select: named("crt", "chassis", "mon.", "lead.anode", "bezel", "cable.neck") },
    { id: "marquee", name: "Marquee lamp", say: "A fluorescent tube that strikes at power-on.", select: named("marquee") },
    { id: "controls", name: "Control panel", say: "The stick closes a microswitch underneath; the buttons fire and start.", select: named("stick", "button.", "cp.", "wire.stick") },
    // Unnamed: only lit or hidden by steps. The quarters on the tray keep it non-empty in the off view.
    // Unnamed: the cabinet's front panel, hidden with the door so the mech behind it shows.
    { id: "front", select: '[data-name="front"]' },
    { id: "coin", select: ["coin-fly", "coin-chute", "coin-fall", "pile", "tray"].map((phase) => `[data-part="${phase}"]`).join(", ") },
  ],
  main: { view: "off" },
  steps: [
    { view: "rolling", title: "The mech checks it", text: "The mech checks the quarter's size and metal and lets it roll on into the chute.", focus: ["coin", "mech", "chute"], hide: ["door", "front"], crop: CHUTE_CROP },
    { view: "rolling", title: "One pulse, one coin", text: "Rolling down the 30° chute, the coin brushes the thin switch wire: one pulse for one coin.", focus: ["coin", "switch", "chute"], crop: CHUTE_CROP },
    { view: "falling", title: "Into the cash box", text: "The coin drops 27 cm into the open cash box, and the meter counts it.", focus: ["coin", "cash", "meter"], crop: [196, 484, 172, 172] },
    { view: "test", title: "Power and self-test", text: "The same pulse latches the power relay. The marquee strikes, the tube heats and the board tests its RAM and ROMs.", focus: ["power", "pcb", "harness"] },
    { view: "attract", title: "Attract mode", text: "After about 2 s the picture appears, drawn up and down the glass, and the game shows itself off until someone presses start.", focus: ["monitor", "marquee"] },
  ],
  details: [
    { title: "The coin mech", text: "Checks each coin before it reaches the chute.", around: ["mech"], focus: ["mech"], hide: ["door", "front"], crop: [290, 470, 76, 76] },
    { title: "The cash box", text: "Open at the top, so the coins can be seen landing.", around: ["cash"], focus: ["cash"] },
    { title: "The game board", text: "Its edge connector on the left carries every wire.", around: ["pcb"], focus: ["pcb", "harness"] },
  ],
};
