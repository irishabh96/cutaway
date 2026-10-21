import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const result = ts.transpileModule(readFileSync("kit/iso-kit.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true },
});
writeFileSync("kit/iso-kit.mjs", result.outputText);
const { ISO_CSS } = await import("../kit/iso-kit.mjs?build");
writeFileSync("kit/iso.css", ISO_CSS);
