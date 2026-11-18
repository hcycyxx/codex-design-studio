import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Design Studio", version: "0.1.0" },
  { availableDisplayModes: ["fullscreen"] }, { autoResize: false });
let session = null;
let started = false;
let resolveSession;
const ready = new Promise((r) => { resolveSession = r; });

const gate = document.getElementById("gate");
const openBtn = document.getElementById("openBtn");
openBtn.onclick = async () => {
  openBtn.disabled = true;
  try {
    await app.sendMessage({ role: "user", content: [{ type: "text", text: "Open the Design Studio sidebar for this chat's active workspace. Call open_design_studio with the absolute projectDir." }] });
  } catch { openBtn.disabled = false; }
};

app.ontoolresult = (result) => {
  if (result.isError) return;
  const s = result._meta?.designSession;
  if (!s) return;
  session = s;
  gate.style.display = "none";
  resolveSession(session);
  if (!started) { started = true; import("../public/workbench.js"); }
};
app.onclose = () => { gate.style.display = "grid"; gate.textContent = "连接已断开，请从对话重新打开设计工作台。"; };
app.onteardown = async () => ({});

async function request(path, body = {}) {
  await ready;
  const result = await app.callServerTool({
    name: "design_app_request",
    arguments: { path, method: "POST", body: { ...session, ...body } }
  }, { timeout: 60000 });
  if (result.isError || !result.structuredContent) throw new Error("请求失败");
  const d = result.structuredContent;
  return d.encoding === "json" ? d.body : JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(d.body), (c) => c.charCodeAt(0))));
}

window.designStudio = {
  get session() { return session; },
  request,
  async sendEdit(text) {
    await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
  }
};

try {
  await app.connect(undefined, { timeout: 15000 });
  const host = app.getHostContext();
  if (host?.displayMode !== "fullscreen" && host?.availableDisplayModes?.includes("fullscreen")) {
    await app.requestDisplayMode({ mode: "fullscreen" }).catch(() => {});
  }
} catch (error) {
  gate.textContent = `无法打开设计工作台：${error.message}`;
}
