// Printable sheets for the push button: node scripts/print.mjs examples/push-button/sheet.mjs --format all
const down = (type) => [["eval", `document.querySelector(".iso-stage").dispatchEvent(new PointerEvent("${type}", { pointerId: 1 }))`], ["wait", 400]];
const part = (id, name, say) => ({ id, name, say, select: `[data-piece="${id}"]` });

export default {
  page: "push-button-light.html",
  out: "push-button",
  views: {
    released: {},
    pressed: { actions: down("pointerdown"), reset: down("pointerup") },
  },
  name: "Push button",
  title: "How a switch closes a circuit",
  number: "CW-003",
  tagline: "A loop, a gap and a spring",
  question: "How does pressing a button turn a light on?",
  lead: "Current only flows round a closed loop. The button is a gap in the loop that a spring holds open: press it and the gap closes, let go and it opens again.",
  quote: "No loop, no current",
  numbers: [
    ["1.5", "V", "from the cell"],
    ["0.30", "A", "round the closed loop"],
    ["0.45", "W", "in the bulb"],
    ["7", "px", "gap the bridge closes"],
  ],
  spec: [
    ["Cell", "1.5 V"],
    ["Current", "0.30 A when closed"],
    ["Power", "0.45 W"],
    ["Travel", "7 px to contact"],
    ["Action", "Momentary, spring return"],
  ],
  why: {
    title: "Why a spring?",
    text: "The spring keeps the button open until you press it and opens it again when you let go, which makes it a momentary switch, like a doorbell. A light switch adds a latch so it stays where you leave it.",
  },
  parts: [
    part("cap", "Cap", "The knurled button you press; it carries the plunger."),
    part("spring", "Return spring", "Squeezed by a press, it lifts the plunger again on release."),
    part("bridge", "Copper bridge", "A bar on the plunger that joins the two posts."),
    part("contacts", "Contact posts", "Two brass posts, one wired to each side of the gap."),
    part("frame", "Frame", "An insulating base and an open frame that guide the plunger."),
    part("cell", "Cell", "A 1.5 V cell in a holder that pushes the current."),
    part("bulb", "Bulb", "A filament in a glass globe that glows when current flows."),
    part("wires", "Wires", "Three runs that join cell, bulb and switch in one loop."),
  ],
  main: { view: "pressed" },
  inset: { label: "Released", view: "released" },
  steps: [
    { view: "released", title: "The loop is open", text: "The spring holds the copper bridge 7 px above the two posts. With a gap in the loop, no current flows.", focus: ["spring", "bridge", "contacts"] },
    { view: "pressed", title: "Press the cap", text: "Pressing the cap pushes the plunger down and squeezes the spring.", focus: ["cap", "spring"] },
    { view: "pressed", title: "The bridge lands", text: "The bridge comes down on both posts at once and closes the gap.", focus: ["bridge", "contacts"] },
    { view: "pressed", title: "Current flows", text: "The loop is closed, so the cell's 1.5 V pushes about 0.3 A round it, through the wires, the switch and the bulb.", focus: ["cell", "wires"] },
    { view: "pressed", title: "The bulb lights", text: "The current heats the filament until it glows, at about 0.45 W.", focus: ["bulb"] },
  ],
  details: [
    { title: "The closed gap", text: "The copper bridge rests on both brass posts.", around: ["bridge", "contacts"], focus: ["bridge", "contacts"] },
    { title: "The bulb", text: "A filament on two supports in a glass globe, on a threaded socket.", around: ["bulb"], focus: ["bulb"] },
    { title: "The cell", text: "1.5 V in a holder; a strap carries the top terminal down to the bench.", around: ["cell"], focus: ["cell"] },
  ],
};
