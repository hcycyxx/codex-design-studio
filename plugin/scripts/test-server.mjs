import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const serverPath = fileURLToPath(new URL("src/mcp-server.mjs", root));
const project = process.argv[2] || "C:/AAA Game System/DSH/codex-design-studio";
const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
child.stderr.on("data", (d) => process.stderr.write(d));
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
let id = 0;
function call(method, params = {}) {
  const myId = ++id;
  return new Promise((resolve) => { pending.set(myId, resolve); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n"); });
}
function ok(label, cond, extra = "") { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`); if (!cond) process.exitCode = 1; }

const init = await call("initialize", {});
ok("initialize", init.result?.serverInfo?.name === "codex-design-studio");
const tools = await call("tools/list");
const names = tools.result.tools.map((t) => t.name);
ok("3 tools", names.length === 3, names.join(","));
const res = await call("resources/list");
ok("ui resource", res.result.resources[0].uri.startsWith("ui://codex-design-studio/"));
const html = await call("resources/read", { uri: res.result.resources[0].uri });
ok("workbench has SDK bundle", html.result.contents[0].text.includes("@modelcontextprotocol") || html.result.contents[0].text.length > 500000);

const open = await call("tools/call", { name: "open_design_studio", arguments: { projectDir: project } });
const designs = open.result.structuredContent.designs;
ok("lists designs", designs.length >= 1, `${designs.length} screens`);
const entry = designs.find((d) => d.path.includes("landing"))?.path || designs[0].path;
const file = await call("tools/call", { name: "design_app_request", arguments: { path: "/api/file", body: { projectDir: project, entryPath: entry } } });
ok("reads HTML", file.result.structuredContent.body.html.includes("<html"));

const comment = await call("tools/call", { name: "design_app_request", arguments: { path: "/api/comment", body: { projectDir: project, entryPath: entry, selector: "h1", text: "标题再大一点", snippet: "好咖啡" } } });
ok("writes comment", comment.result.structuredContent.body.ok);
const commentFile = path.join(project, comment.result.structuredContent.body.file);
const comments = JSON.parse(await (await import("node:fs/promises")).readFile(commentFile, "utf8"));
ok("comment persisted", comments.some((c) => c.selector === "h1"));

const tweak = await call("tools/call", { name: "design_app_request", arguments: { path: "/api/tweak", body: { projectDir: project, entryPath: entry, vars: { accent: "#ff0000" } } } });
ok("applies tweak", tweak.result.structuredContent.body.ok);
const after = await call("tools/call", { name: "design_app_request", arguments: { path: "/api/file", body: { projectDir: project, entryPath: entry } } });
ok("tweak written to file", /--accent\s*:\s*#ff0000/i.test(after.result.structuredContent.body.html));

// Restore the fixture so repeated runs are idempotent.
const fs = await import("node:fs/promises");
const original = path.join(project, entry).replace(/\\/g, "/");
let restored = await fs.readFile(original, "utf8");
restored = restored.replace(/--accent\s*:\s*#ff0000/i, "--accent:#C9632F");
await fs.writeFile(original, restored, "utf8");
await fs.rm(commentFile, { force: true }).catch(() => {});
child.kill();
