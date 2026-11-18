import readline from "node:readline";
import fs from "node:fs/promises";
import path from "node:path";

const APP_VERSION = "0.1.0";
const RESOURCE_URI = `ui://codex-design-studio/workbench-${APP_VERSION}.html`;
const RESOURCE_META = {
  ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
  "openai/ui": { availableDisplayModes: ["fullscreen"], preferredDisplayMode: "fullscreen" }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method?.startsWith("notifications/")) return;
  try { respond(msg.id, await handle(msg.method, msg.params || {})); }
  catch (error) { respondError(msg.id, error); }
});

function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"); }
function respondError(id, error) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: String(error?.message || error) } }) + "\n");
}

function safeResolve(projectDir, relPath) {
  if (!projectDir || typeof projectDir !== "string") throw new Error("projectDir is required.");
  const root = path.resolve(projectDir);
  const target = path.resolve(root, relPath || "");
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Path escapes the project directory.");
  return { root, target };
}

async function walk(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".open-design") continue;
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out, depth + 1);
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function listDesigns(projectDir) {
  const root = path.resolve(projectDir);
  const files = await walk(root);
  const designs = [];
  for (const file of files) {
    let title = path.basename(file);
    try {
      const html = await fs.readFile(file, "utf8");
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (m) title = m[1].trim() || title;
    } catch {}
    designs.push({ path: path.relative(root, file).replace(/\\/g, "/"), title });
  }
  return designs.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200);
}

async function handle(method, params) {
  if (method === "initialize") {
    return { protocolVersion: params.protocolVersion || "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "codex-design-studio", version: APP_VERSION } };
  }
  if (method === "ping") return {};
  if (method === "resources/list") return { resources: [{ uri: RESOURCE_URI, name: "Design Studio", mimeType: "text/html;profile=mcp-app", _meta: RESOURCE_META }] };
  if (method === "resources/read") {
    if (params.uri !== RESOURCE_URI) throw new Error("Unknown resource.");
    return { contents: [{ uri: RESOURCE_URI, mimeType: "text/html;profile=mcp-app", text: await fs.readFile(new URL("../public/workbench.html", import.meta.url), "utf8"), _meta: RESOURCE_META }] };
  }
  if (method === "tools/list") {
    const appOnly = { ui: { visibility: ["app"] } };
    return { tools: [
      {
        name: "open_design_studio",
        title: "Design Studio",
        description: "Open the design workbench in the Codex sidebar. Pass the absolute projectDir and optionally an entryPath to show a specific HTML design.",
        _meta: { ui: { resourceUri: RESOURCE_URI }, "openai/ui": { entrypoints: [{ type: "thread" }] } },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        inputSchema: { type: "object", required: ["projectDir"], properties: {
          projectDir: { type: "string" },
          entryPath: { type: "string", description: "Relative HTML path, e.g. .open-design/demo/landing.html" }
        } }
      },
      {
        name: "list_designs",
        description: "List HTML design artifacts in a project.",
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        inputSchema: { type: "object", required: ["projectDir"], properties: { projectDir: { type: "string" } } }
      },
      {
        name: "design_app_request",
        description: "Private transport for the design workbench sidebar API.",
        _meta: appOnly,
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        inputSchema: { type: "object", required: ["path"], properties: {
          path: { type: "string" }, method: { type: "string", enum: ["GET", "POST"] }, body: { type: "object" }
        } }
      }
    ] };
  }
  if (method === "tools/call") {
    const { name, arguments: args = {} } = params;
    if (name === "open_design_studio") {
      const designs = await listDesigns(args.projectDir);
      return { content: [{ type: "text", text: `Opened design studio with ${designs.length} screen(s).` }], structuredContent: { open: true, projectDir: path.resolve(args.projectDir), entryPath: args.entryPath || designs[0]?.path || "", designs }, _meta: { designSession: { projectDir: path.resolve(args.projectDir), entryPath: args.entryPath || designs[0]?.path || "" } } };
    }
    if (name === "list_designs") {
      const designs = await listDesigns(args.projectDir);
      return { content: [{ type: "text", text: JSON.stringify(designs, null, 2) }], structuredContent: { designs } };
    }
    if (name === "design_app_request") return await appRequest(args);
    throw new Error(`Unknown tool: ${name}`);
  }
  throw new Error(`Unknown method: ${method}`);
}

async function appRequest({ path: route, method = "GET", body = {} }) {
  const projectDir = body.projectDir;
  if (route === "/api/screens") return json(await listDesigns(projectDir));
  if (route === "/api/file") {
    const { root, target } = safeResolve(projectDir, body.entryPath);
    const html = await fs.readFile(target, "utf8");
    return json({ html, entryPath: path.relative(root, target).replace(/\\/g, "/") });
  }
  if (route === "/api/comment") {
    const { target } = safeResolve(projectDir, body.entryPath);
    const commentPath = target.replace(/\.html?$/i, "") + ".comments.json";
    let comments = [];
    try { comments = JSON.parse(await fs.readFile(commentPath, "utf8")); } catch {}
    comments.push({
      id: String(Date.now()), selector: body.selector || "", text: body.text || "",
      snippet: body.snippet || "", rect: body.rect || null,
      createdAt: new Date().toISOString()
    });
    await fs.writeFile(commentPath, JSON.stringify(comments, null, 2), "utf8");
    return json({ ok: true, file: path.relative(projectDir, commentPath).replace(/\\/g, "/"), count: comments.length });
  }
  if (route === "/api/tweak") {
    const { target } = safeResolve(projectDir, body.entryPath);
    const html = await fs.readFile(target, "utf8");
    let updated = html;
    for (const [name, value] of Object.entries(body.vars || {})) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(--${escaped}\\s*:\\s*)([^;]+)(;)`);
      if (re.test(updated)) updated = updated.replace(re, `$1${value}$3`);
      else updated = updated.replace("</style>", `  --${name}: ${value};\n</style>`);
    }
    await fs.writeFile(target, updated, "utf8");
    return json({ ok: true, vars: body.vars || {} });
  }
  throw new Error(`Unknown app route: ${route}`);
}

function json(body, status = 200) {
  return { structuredContent: { status, headers: { "content-type": "application/json" }, encoding: "json", body } };
}
