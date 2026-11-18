import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootDir = fileURLToPath(root);
const project = "C:/AAA Game System/DSH/codex-design-studio";
const entry = ".open-design/demo-landing/landing.html";
const designHtml = await fs.readFile(path.join(project, entry), "utf8");

// Build a standalone preview: template HTML (no SDK) + stub bridge + real workbench UI.
const template = await fs.readFile(new URL("public/workbench-template.html", root), "utf8");
const designB64 = Buffer.from(designHtml, "utf8").toString("base64");
const stub = `<script>
setTimeout(()=>{ const g=document.getElementById("gate"); if(g) g.style.display="none"; }, 50);
const screens=[{path:${JSON.stringify(entry)},title:"咖啡订阅 · 落地页"}];
const designHtml=new TextDecoder().decode(Uint8Array.from(atob("${designB64}"),c=>c.charCodeAt(0)));
window.designStudio={
  session:{projectDir:${JSON.stringify(project)},entryPath:${JSON.stringify(entry)}},
  request: async (p) => {
    if(p==="/api/screens") return screens;
    if(p==="/api/file") return {html:designHtml};
    if(p==="/api/comment") return {ok:true,file:"stub.comments.json",count:1};
    if(p==="/api/tweak") return {ok:true};
    return {};
  },
  sendEdit: async()=>{}
};
</script>`;
const uiSrc = await fs.readFile(new URL("public/workbench.js", root), "utf8");
const ui = `<script>${uiSrc.replace(/<\/script/gi, "<\\/script")}</script>`;
const standalone = template.replace("/*BUNDLE*/", "").replace("<script type=\"module\"></script>", "").replace("</head>", stub + "</head>").replace("</body>", ui + "</body>");
const tmp = path.join(rootDir, "workbench.preview.html");
await fs.writeFile(tmp, standalone, "utf8");

let browser;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
try { browser = await chromium.launch({ headless: true, executablePath: chromePath }); }
catch (e) { console.error("playwright browser missing:", e.message); process.exit(3); }
const page = await browser.newPage({ viewport: { width: 1320, height: 880 } });
page.on("console", (m) => console.error("PAGE " + m.type() + ":", m.text()));
page.on("pageerror", (e) => console.error("PAGE EXCEPTION:", e.message));
await page.goto("file://" + tmp);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(rootDir, "workbench-preview.png") });
await browser.close();
console.log("screenshot saved:", path.join(rootDir, "workbench-preview.png"));
