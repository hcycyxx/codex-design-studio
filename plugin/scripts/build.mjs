import { build } from "esbuild";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
let bundle;
try {
  const out = await build({
    entryPoints: [fileURLToPath(new URL("ui/workbench-app.js", root))],
    bundle: true, format: "esm", platform: "browser", target: "es2022",
    minify: true, write: false
  });
  bundle = out.outputFiles[0].text;
} catch (error) {
  // Fallback: fetch the SDK from the sibling codex-canvas install when workspace deps are restricted.
  console.error("esbuild failed:", error.message);
  process.exit(2);
}
const template = await fs.readFile(new URL("public/workbench-template.html", root), "utf8");
const html = template.replace("/*BUNDLE*/", bundle.replace(/<\/script/gi, "<\\/script"));
await fs.writeFile(new URL("public/workbench.html", root), html);
console.log(`Built workbench.html (${html.length} chars).`);
