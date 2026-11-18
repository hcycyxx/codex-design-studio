const api = window.designStudio;
const screensEl = document.getElementById("screens");
const frame = document.getElementById("frame");
const stage = document.getElementById("stage");
const deviceSel = document.getElementById("device");
const commentBar = document.getElementById("commentBar");
const tweaksPanel = document.getElementById("tweaks");
const hint = document.getElementById("hint");

let current = null;
let htmlText = "";
let commentMode = false;
let vars = [];

const DEVICES = {
  desktop: { w: 1280, h: 800, label: "桌面" },
  tablet: { w: 768, h: 1024, label: "平板" },
  phone: { w: 390, h: 844, label: "手机" }
};

function cssPath(el) {
  if (!(el instanceof Element)) return "";
  const parts = [];
  let node = el;
  while (node && node !== document.body && parts.length < 6) {
    let part = node.tagName.toLowerCase();
    if (node.id) { parts.unshift(`#${node.id}`); break; }
    const cls = [...node.classList].filter((c) => !c.startsWith("ds-")).slice(0, 2);
    if (cls.length) part += "." + cls.join(".");
    const sibs = node.parentElement ? [...node.parentElement.children].filter((n) => n.tagName === node.tagName) : [];
    if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

async function loadScreens() {
  const list = await api.request("/api/screens");
  screensEl.replaceChildren();
  for (const s of list) {
    const b = document.createElement("button");
    b.className = "screen";
    b.textContent = s.title;
    b.title = s.path;
    b.onclick = () => load(s.path);
    screensEl.append(b);
  }
  const start = api.session.entryPath || list[0]?.path;
  if (start) load(start);
}

async function load(entryPath) {
  current = entryPath;
  const data = await api.request("/api/file", { entryPath });
  htmlText = data.html;
  [...screensEl.children].forEach((b) => b.classList.toggle("active", b.title === entryPath));
  render();
  parseVars();
  hint.textContent = `已载入 ${entryPath}`;
}

function render() {
  const d = DEVICES[deviceSel.value] || DEVICES.desktop;
  frame.style.width = d.w + "px";
  frame.style.height = d.h + "px";
  frame.style.transform = `scale(${Math.min(1, (stage.clientWidth - 48) / d.w)})`;
  frame.style.transformOrigin = "top center";
  const doc = frame.contentDocument;
  doc.open(); doc.write(htmlText); doc.close();
  doc.addEventListener("click", onClick, true);
}

function onClick(e) {
  if (!commentMode) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.target;
  const selector = cssPath(el);
  const rect = el.getBoundingClientRect();
  const pos = { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) };
  const input = document.getElementById("commentText");
  const text = input.value.trim() || "请修改这里";
  api.request("/api/comment", { entryPath: current, selector, text, snippet: (el.textContent || "").trim().slice(0, 80), rect: pos })
    .then((r) => {
      const msg = `请修改 ${current} 里的这个元素（CSS 选择器：${selector}，位置 ${pos.x},${pos.y}）：${text}。只改这一处，不要动其他内容。批注已写入 ${r.file}。`;
      input.value = "";
      setCommentMode(false);
      hint.textContent = `批注已保存 → ${r.file}`;
      api.sendEdit(msg);
    });
}

function setCommentMode(on) {
  commentMode = on;
  document.getElementById("commentBtn").classList.toggle("active", on);
  commentBar.style.display = on ? "flex" : "none";
  frame.classList.toggle("commenting", on);
}

function parseVars() {
  vars = [];
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(htmlText))) {
    const name = m[1], raw = m[2].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    const isColor = /^#|^(rgb|hsl|oklch)/i.test(raw);
    const num = parseFloat(raw);
    if (isColor || (!isNaN(num) && /(px|rem|em)$/.test(raw))) vars.push({ name, raw, isColor, num, unit: (raw.match(/(px|rem|em)$/) || [""])[0] });
  }
  tweaksEl = document.getElementById("tweakList");
  tweaksEl.replaceChildren();
  for (const v of vars.slice(0, 14)) {
    const row = document.createElement("div");
    row.className = "tweak";
    const label = document.createElement("label");
    label.textContent = v.name;
    row.append(label);
    if (v.isColor) {
      const input = document.createElement("input");
      input.type = "color";
      input.value = /^#([0-9a-f]{6})$/i.test(v.raw) ? v.raw : "#888888";
      input.oninput = () => applyVar(v.name, input.value);
      row.append(input);
    } else {
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(Math.max(0, v.num * 0.4));
      range.max = String(v.num * 2);
      range.step = String(v.num / 100 || 0.1);
      range.value = String(v.num);
      range.oninput = () => applyVar(v.name, range.value + v.unit);
      row.append(range);
    }
    tweaksEl.append(row);
  }
}

let applyTimer = null;
function applyVar(name, value) {
  const doc = frame.contentDocument;
  doc.documentElement.style.setProperty(`--${name}`, value);
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => api.request("/api/tweak", { entryPath: current, vars: { [name]: value } }), 500);
}

document.getElementById("commentBtn").onclick = () => setCommentMode(!commentMode);
document.getElementById("cancelBtn").onclick = () => setCommentMode(false);
document.getElementById("sendBtn").onclick = () => {
  const fake = { target: frame.contentDocument.body.firstElementChild || frame.contentDocument.body };
  onClick({ preventDefault() {}, stopPropagation() {}, target: fake.target });
};
deviceSel.onchange = render;
document.getElementById("tweaksBtn").onclick = () => tweaksPanel.classList.toggle("open");
window.addEventListener("resize", render);

loadScreens().catch((e) => { hint.textContent = "错误：" + e.message; });
