// ===== Literature matrix: a row per reference, import from Word, save to Word, AI drafts from the PDF =====
var MX_FIELDS = [
  ["sample", "Sample"],
  ["framework", "Theoretical Framework / Constructs"],
  ["design", "Design / Data Analysis"],
  ["findings", "Findings"],
];
var MX_METHODS = ["QUAN", "QUAL", "MIX"];
var AI = { settings: null, busy: null, batch: null };

function mxOf(it) { return Object.assign({ sample: "", method: "", framework: "", design: "", findings: "", draft: {} }, it.mx || {}); }
function mxHas(it) { const m = it.mx; return !!(m && (m.sample || m.method || m.framework || m.design || m.findings)); }
function mxDrafts(it) { const m = it.mx; return m && m.draft ? Object.keys(m.draft).filter(k => m.draft[k]).length : 0; }
function mxAuthorCell(it) {
  const f = citeForms(it);
  const p = (f.parentheticalFirst || f.parenthetical).replace(/^\(|\)$/g, "");
  const i = p.lastIndexOf(", ");
  return i > 0 ? p.slice(0, i) + " (" + p.slice(i + 2) + ")" : p;
}
function itemPdfLocal(it) { return it.file && !String(it.file).startsWith("drive:"); }

// ---------- detail pane: the matrix row for one reference ----------
function matrixHtml(it) {
  const m = mxOf(it), d = m.draft || {};
  const nd = mxDrafts(it);
  const field = (k, label) => `<label class="f mxf${d[k] ? " draft" : ""}"><span>${label}${d[k] ? ` <span class="pill warn">Draft</span> <button class="copy" data-mxok="${k}">Accept</button><button class="copy" data-mxno="${k}">Reject</button>` : ""}</span><textarea data-mx="${k}" rows="${k === "findings" ? 5 : 2}">${esc(m[k] || "")}</textarea></label>`;
  return `<details class="mxbox" id="mxBox" ${mxHas(it) || AI.busy === it.id ? "open" : ""}>
    <summary><h3 style="display:inline;margin:0">Matrix row</h3> ${mxHas(it) ? (nd ? `<span class="pill warn">${nd} draft${nd === 1 ? "" : "s"} to review</span>` : `<span class="pill ok">Filled</span>`) : `<span class="note">empty</span>`}</summary>
    <div style="display:grid;gap:8px;margin-top:8px">
      <div class="row" id="mxAiRow"></div>
      ${field("sample", "Sample")}
      <div class="f mxf${d.method ? " draft" : ""}"><span>Methodology${d.method ? ` <span class="pill warn">Draft</span> <button class="copy" data-mxok="method">Accept</button><button class="copy" data-mxno="method">Reject</button>` : ""}</span>
        <div class="row" role="radiogroup">${MX_METHODS.concat([""]).map(x => `<label class="note" style="display:flex;gap:4px;align-items:center"><input type="radio" name="mxMethod" value="${x}" ${m.method === x ? "checked" : ""}>${x || "None"}</label>`).join("")}</div></div>
      ${field("framework", "Theoretical Framework / Constructs")}
      ${field("design", "Design / Data Analysis")}
      ${field("findings", "Findings")}
      ${nd ? `<div class="row"><button class="btn" id="mxAcceptAll">Accept all drafts</button><span class="note">A draft becomes yours when you accept it or edit it.</span></div>` : ""}
    </div>
  </details>`;
}
async function mxSave(it, change) {
  const cur = items.find(x => x.id === it.id) || it;
  const m = mxOf(cur);
  change(m);
  for (const k of Object.keys(m.draft)) if (!m.draft[k]) delete m.draft[k];
  await saveItem(Object.assign({}, cur, { mx: m }));
}
function bindMatrix(it) {
  const box = $("#mxBox"); if (!box) return;
  // typing in a cell saves quietly, without redrawing the pane under the cursor
  const quiet = async fn => { window.__mxQuiet = true; try { await fn(); } finally { window.__mxQuiet = false; } };
  box.querySelectorAll("textarea[data-mx]").forEach(ta => ta.addEventListener("change", () => setTimeout(() => quiet(async () => {
    const k = ta.dataset.mx, v = ta.value.trim();
    await mxSave(it, m => { m[k] = v; m.draft[k] = false; });
    const lab = ta.closest(".mxf"); if (lab) { lab.classList.remove("draft"); lab.querySelectorAll(".pill,[data-mxok],[data-mxno]").forEach(x => x.remove()); }
    mxSummary(it.id);
  }), 0)));
  box.querySelectorAll("input[name=mxMethod]").forEach(r => r.addEventListener("change", () => setTimeout(() => quiet(async () => {
    await mxSave(it, m => { m.method = r.value; m.draft.method = false; });
    const lab = r.closest(".mxf"); if (lab) { lab.classList.remove("draft"); lab.querySelectorAll(".pill,[data-mxok],[data-mxno]").forEach(x => x.remove()); }
    mxSummary(it.id);
  }), 0)));
  box.querySelectorAll("[data-mxok]").forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.mxok; setTimeout(() => quiet(async () => { await mxSave(it, m => { m.draft[k] = false; }); refreshMatrixRow(it.id); }), 0); });
  box.querySelectorAll("[data-mxno]").forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.mxno; setTimeout(() => quiet(async () => { await mxSave(it, m => { m[k] = ""; m.draft[k] = false; }); refreshMatrixRow(it.id); }), 0); });
  const all = $("#mxAcceptAll"); if (all) all.onclick = () => setTimeout(() => quiet(async () => { await mxSave(it, m => { m.draft = {}; }); refreshMatrixRow(it.id); }), 0);
  renderAiRow(it);
}
function mxSummary(id) {
  const it = items.find(x => x.id === id), box = $("#mxBox"); if (!it || !box) return;
  const nd = mxDrafts(it), sm = box.querySelector("summary");
  if (sm) sm.innerHTML = `<h3 style="display:inline;margin:0">Matrix row</h3> ${mxHas(it) ? (nd ? `<span class="pill warn">${nd} draft${nd === 1 ? "" : "s"} to review</span>` : `<span class="pill ok">Filled</span>`) : `<span class="note">empty</span>`}`;
  if (!nd) { const a = $("#mxAcceptAll"); if (a) a.parentElement.remove(); }
}
function refreshMatrixRow(id) {
  const box = $("#mxBox"); if (!box || selectedId !== id) return;
  const it = items.find(x => x.id === id); if (!it) return;
  const open = box.open;
  box.outerHTML = matrixHtml(it);
  if (open) $("#mxBox").open = true;
  bindMatrix(it);
}
function renderAiRow(it) {
  const row = $("#mxAiRow"); if (!row) return;
  const ready = aiReady();
  if (AI.busy === it.id) {
    row.innerHTML = `<span class="note" id="mxAiNote">Drafting with ${esc(aiLabel())}…</span><button class="copy" id="mxAiStop">Stop</button>`;
    $("#mxAiStop").onclick = () => { if (AI.ctrl) AI.ctrl.abort(); };
    return;
  }
  if (!itemPdfLocal(it)) { row.innerHTML = `<span class="note">${it.file ? "AI drafting reads PDFs in your PDF folder; this reference is linked to Google Drive." : "Link this reference to its PDF (Open my copy, above) to draft the row with AI."}</span>`; return; }
  if (!ready) { row.innerHTML = `<button class="btn" id="mxAiSetup">Set up AI drafting</button><span class="note">in Settings</span>`; $("#mxAiSetup").onclick = () => showTab("settings"); return; }
  row.innerHTML = `<button class="btn" id="mxAiGo" ${AI.busy ? "disabled" : ""}>Draft with AI</button><span class="note">${AI.busy ? "Another draft is running." : `Reads the PDF with ${esc(aiLabel())} and fills empty cells as drafts. Cells you've accepted are left alone.`}</span>`;
  $("#mxAiGo").onclick = async () => {
    const res = await aiDraftItem(it, s => { const n = $("#mxAiNote"); if (n) n.textContent = s; });
    refreshMatrixRow(it.id); renderList();
    if (res.ok) toast(res.filled ? `Drafted ${res.filled} cell${res.filled === 1 ? "" : "s"}. Review them below.` : "No empty cells to fill."); else if (res.error) toast(res.error);
    if (res.cut) toast("The article was too long for the model's context, so the middle was left out. Check the Findings carefully, or raise the context length.");
  };
}

// ---------- AI settings and calls ----------
async function aiLoad() {
  if (AI.settings) return AI.settings;
  let s = {};
  try { s = window.citekeepApp && window.citekeepApp.getSettings ? await window.citekeepApp.getSettings() : {}; } catch (e) {}
  AI.settings = {
    provider: s.aiProvider || "lmstudio",
    url: s.aiUrl || "http://localhost:1234",
    model: s.aiModel || "",
    ctx: +s.aiCtx || 32768,
    claudeModel: s.claudeModel || "claude-sonnet-5-5",
    hasKey: !!s.claudeKey,
    title: s.matrixTitle || "Literature Review Matrix",
    rules: s.aiRules || "",
  };
  return AI.settings;
}
function aiReady() { const s = AI.settings; return !!(s && (s.provider === "claude" ? s.hasKey : s.url)) && typeof readPdfFull === "function"; }
function aiLabel() { const s = AI.settings || {}; return s.provider === "claude" ? (s.claudeModel === "claude-opus-5-5" ? "Claude Opus 5.5" : "Claude Sonnet 5.5") : "LM Studio" + (s.model ? ` (${s.model})` : ""); }
async function aiSet(k, v) { try { await window.citekeepApp.setSetting(k, v); } catch (e) {} }

const MX_SYSTEM = `You fill in one row of a literature-review matrix for a researcher, using only the article text you are given.

Rules:
- Take everything from the body of the article: method, results, tables, and discussion. Never take sample sizes, statistics, or findings from the abstract. If something appears only in the abstract, leave it out.
- Do not invent or estimate anything. If the article does not report something, say so briefly (for example "Sample size not reported."). If the work has no original participants or data, say so in Sample (for example "No original participant sample; theoretical analysis of ...").
- Write in a plain, direct academic register. Past tense for what the researchers did and found. No evaluative words such as "important", "robust", or "compelling". No hedging.
- Never mention the PDF, the text you were given, the abstract, versions of the article, or yourself. State the source's content only.

Fields:
- sample: who or what was studied, with counts, setting, grade levels, and years where reported. One or two sentences.
- method: exactly one of "QUAN", "QUAL", "MIX", or "" (empty when there is no original or synthesized data, such as a theoretical essay or policy argument). Meta-analyses and quantitative systematic reviews are QUAN. Qualitative syntheses and narrative reviews of studies are QUAL.
- framework: the theoretical framework and the key constructs, as a short semicolon-separated list.
- design: name the approach and design explicitly (for example "Quantitative quasi-experimental difference-in-differences design ..."), then the data sources and analysis methods.
- findings: the main findings with statistics exactly as reported (effect sizes, coefficients, p values, confidence intervals). After each finding, give its location in parentheses as (p. N, para. N), or several as (p. 3, para. 5; p. 4, para. 1). Use the page number printed on the article page (journal pagination) when the page text shows one; otherwise use the PDF page number. Never write "PDF p.". Count paragraphs from the top of that page, where a paragraph continued from the previous page counts as paragraph 1.

Return only a JSON object with the keys sample, method, framework, design, findings. No other text.`;

function mxExamples() {
  const done = items.filter(i => i.mx && i.mx.findings && i.mx.design && i.mx.sample && !mxDrafts(i));
  if (!done.length) return "";
  const pick = done.slice().sort((a, b) => (a.mx.findings.length - b.mx.findings.length)).slice(Math.max(0, Math.floor(done.length / 2) - 1), Math.floor(done.length / 2) + 1);
  return "\n\nRows already written for this matrix, to show the expected length and style (do not copy their content):\n" + pick.map(i => JSON.stringify({ sample: i.mx.sample, method: i.mx.method || "", framework: i.mx.framework, design: i.mx.design, findings: i.mx.findings })).join("\n");
}
function fitText(text, maxChars) {
  let t = text, cut = false;
  // the reference list adds length and nothing the row needs
  const re = /\n\s*(references|reference list|works cited|literature cited|bibliography)\s*\n/gi; let m, last = -1;
  while ((m = re.exec(t))) last = m.index;
  if (last > t.length * 0.4) t = t.slice(0, last);
  if (t.length > maxChars) {
    const head = Math.floor(maxChars * 0.45), tail = maxChars - head;
    t = t.slice(0, head) + "\n\n[... part of the middle of the article is omitted here ...]\n\n" + t.slice(t.length - tail);
    cut = true;
  }
  return { text: t, cut };
}
function parseAiJson(s) {
  s = String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("The model didn't return a matrix row. Try again, or try a different model.");
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error("The model's answer wasn't readable. Try again."); }
  const str = v => (Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v)).replace(/\bPDF p\./g, "p.").trim();
  let method = str(j.method).toUpperCase(); if (/MIX/.test(method)) method = "MIX"; else if (/QUAL/.test(method)) method = "QUAL"; else if (/QUAN/.test(method)) method = "QUAN"; else method = "";
  return { sample: str(j.sample), method, framework: str(j.framework), design: str(j.design), findings: str(j.findings) };
}
const MX_SCHEMA = { type: "object", properties: { sample: { type: "string" }, method: { type: "string", enum: ["QUAN", "QUAL", "MIX", ""] }, framework: { type: "string" }, design: { type: "string" }, findings: { type: "string" } }, required: ["sample", "method", "framework", "design", "findings"] };
async function aiComplete(system, user, signal, schema, schemaName) {
  const s = AI.settings;
  if (s.provider === "claude") {
    const key = await window.citekeepApp.claudeKey();
    if (!key) throw new Error("Enter your Claude API key in Settings → AI drafting.");
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: s.claudeModel, max_tokens: 3000, system, messages: [{ role: "user", content: user }] }) });
    } catch (e) { if (e.name === "AbortError") throw e; throw new Error("Couldn't reach the Claude API. Check your internet connection."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? "The Claude API key was refused. Check it in Settings → AI drafting." : "Claude API: " + ((j.error && j.error.message) || r.status));
    return (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  }
  const base = s.url.replace(/\/+$/, "").replace(/\/v1$/, "");
  const qwen = /qwen3/i.test(s.model || "");
  const body = { messages: [{ role: "system", content: system }, { role: "user", content: user + (qwen ? "\n\n/no_think" : "") }], temperature: 0.2, max_tokens: 3000, stream: false };
  if (s.model) body.model = s.model;
  const call = async withSchema => {
    const b = Object.assign({}, body, withSchema ? { response_format: { type: "json_schema", json_schema: { name: schemaName || "matrix_row", strict: true, schema: schema || MX_SCHEMA } } } : {});
    try { return await fetch(base + "/v1/chat/completions", { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); }
    catch (e) { if (e.name === "AbortError") throw e; throw new Error("Couldn't reach LM Studio at " + base + ". In LM Studio, start the local server and turn on Enable CORS."); }
  };
  let r = await call(true);
  if (r.status === 400) { const t = await r.text(); if (/context|token/i.test(t) && /length|exceed|overflow|too/i.test(t)) throw new Error("The article is longer than the context length LM Studio loaded the model with. Reload the model with a larger context length, or lower the context length setting here to match."); r = await call(false); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const msg = (j.error && (j.error.message || j.error)) || r.status; throw new Error(/context|token/i.test(String(msg)) ? "The article is longer than the model's loaded context length. Reload the model in LM Studio with a larger context length." : "LM Studio: " + msg); }
  const c = j.choices && j.choices[0];
  return (c && c.message && (c.message.content || "")) || "";
}
async function aiDraftItem(it, onStatus) {
  await aiLoad();
  if (!aiReady()) return { ok: false, error: "Set up AI drafting in Settings first." };
  if (!itemPdfLocal(it)) return { ok: false, error: "This reference isn't linked to a PDF in your PDF folder." };
  if (AI.busy) return { ok: false, error: "Another draft is running." };
  AI.busy = it.id; AI.ctrl = new AbortController();
  const t0 = Date.now();
  const tick = setInterval(() => { const n = $("#mxAiNote"); if (n && AI.busy === it.id) n.textContent = `Drafting with ${aiLabel()}… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  refreshMatrixRow(it.id);
  try {
    if (onStatus) onStatus("Reading the PDF…");
    const full = await readPdfFull(it.file);
    if (!full || full.replace(/\s+/g, "").length < 400) return { ok: false, error: "This PDF has no readable text (it may be a scan), so it can't be drafted." };
    const s = AI.settings;
    const sys = ((AI.settings.rules || "").trim() || MX_SYSTEM) + mxExamples();
    const budget = s.provider === "claude" ? 600000 : Math.max(6000, Math.floor((s.ctx - 3500 - sys.length / 3.2) * 3.2));
    const fit = fitText(full, budget);
    const ref = htmlToText(formatReference(it));
    const out = parseAiJson(await aiComplete(sys, `Reference: ${ref}\n\nArticle text, page by page:\n\n${fit.text}`, AI.ctrl.signal));
    let filled = 0;
    await mxSave(it, m => {
      for (const k of ["sample", "framework", "design", "findings"]) if ((!m[k] || m.draft[k]) && out[k]) { m[k] = out[k]; m.draft[k] = true; filled++; }
      if (!m.method || m.draft.method) { m.method = out.method; m.draft.method = true; }
      m.aiAt = new Date().toISOString().slice(0, 10);
    });
    return { ok: true, filled, cut: fit.cut };
  } catch (e) {
    if (e.name === "AbortError") return { ok: false, error: "Stopped." };
    return { ok: false, error: e.message || "Drafting failed." };
  } finally { clearInterval(tick); AI.busy = null; AI.ctrl = null; }
}

// ---------- the Matrix tab ----------
let mxImportReport = "";
function matrixRows() {
  const S = bibSources(), sel = $("#mxSrc");
  const cur = sel.value || "all";
  sel.innerHTML = S.map(s => `<option value="${esc(s.key)}" ${s.key === cur ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  let src = (S.find(s => s.key === sel.value) || S[0]).pick().map(x => Object.assign({}, x));
  assignSuffixes(src);
  if ($("#mxOnly").checked) src = src.filter(mxHas);
  return src.sort((a, b) => { const x = orderKey(a), y = orderKey(b); return x < y ? -1 : x > y ? 1 : 0; });
}
async function renderMatrix() {
  const s = await aiLoad();
  if (!$("#mxTitle").value) $("#mxTitle").value = s.title;
  const rows = matrixRows();
  const filled = rows.filter(mxHas).length, drafts = rows.reduce((n, r) => n + mxDrafts(r), 0);
  const canDraft = rows.filter(r => itemPdfLocal(r) && (!mxHas(r) || ["sample", "design", "findings"].some(k => !r.mx[k])));
  $("#mxStats").innerHTML = `<div class="stat"><b>${rows.length}</b><span>rows</span></div><div class="stat ok"><b>${filled}</b><span>with matrix content</span></div><div class="stat ${drafts ? "warn" : "ok"}"><b>${drafts}</b><span>draft cells to review</span></div><div class="stat"><b>${canDraft.length}</b><span>incomplete rows with a PDF</span></div>`;
  const bb = $("#mxBatch");
  if (AI.batch) { bb.textContent = "Stop drafting"; bb.disabled = false; }
  else { bb.textContent = `Draft ${canDraft.length} incomplete row${canDraft.length === 1 ? "" : "s"} with AI`; bb.disabled = !canDraft.length || !aiReady() || !!AI.busy; }
  $("#mxSave").hidden = !downloads;
  const cell = (it, k) => { const m = it.mx || {}; const v = m[k] || ""; return `<td class="${m.draft && m.draft[k] ? "mxd" : ""}">${esc(v)}</td>`; };
  $("#mxTable").innerHTML = rows.length ? `<table class="mxt"><thead><tr><th rowspan="2">Author(s)</th><th rowspan="2">Sample</th><th colspan="3">Methodology</th><th rowspan="2">Theoretical Framework / Constructs</th><th rowspan="2">Design / Data Analysis</th><th rowspan="2">Findings</th></tr><tr><th>QUAN</th><th>QUAL</th><th>MIX</th></tr></thead><tbody>${rows.map(it => { const m = it.mx || {}; return `<tr data-item="${it.id}"><td><b>${esc(mxAuthorCell(it))}</b></td>${cell(it, "sample")}${MX_METHODS.map(x => `<td class="c ${m.draft && m.draft.method && m.method === x ? "mxd" : ""}">${m.method === x ? "X" : ""}</td>`).join("")}${cell(it, "framework")}${cell(it, "design")}${cell(it, "findings")}</tr>`; }).join("")}</tbody></table>` : `<div class="empty"><b>No rows</b>Choose a different set of references, or import your matrix.</div>`;
  $("#mxReport").innerHTML = mxImportReport;
  renderAiSettings();
}
function renderAiSettings() {
  const s = AI.settings; const c = $("#aiCard"); if (!c || !s) return;
  c.innerHTML = `<h3 style="margin:0">AI drafting</h3>
    <p class="note" style="margin:0">Citekeep can read a reference's PDF and draft its matrix row. Drafts are marked until you accept or edit them, and cells you've accepted are never overwritten. Findings come from the body of the article, not the abstract.</p>
    <div class="row" role="radiogroup"><label class="note" style="display:flex;gap:4px;align-items:center"><input type="radio" name="aiProv" value="lmstudio" ${s.provider !== "claude" ? "checked" : ""}>LM Studio on this computer (free, private)</label><label class="note" style="display:flex;gap:4px;align-items:center"><input type="radio" name="aiProv" value="claude" ${s.provider === "claude" ? "checked" : ""}>Claude API (your key, paid per use)</label></div>
    ${s.provider !== "claude" ? `
      <label class="f"><span>LM Studio server address</span><input type="text" id="aiUrl" value="${esc(s.url)}"></label>
      <label class="f"><span>Model</span><select id="aiModel"><option value="${esc(s.model)}">${esc(s.model || "Whichever model is loaded")}</option></select></label>
      <label class="f"><span>Context length the model is loaded with (tokens)</span><input type="number" id="aiCtx" min="4096" step="1024" value="${s.ctx}"></label>
      <div class="row"><button class="btn" id="aiTest">Test connection</button><span class="note" id="aiTestNote">${esc(AI.testNote || "")}</span></div>
      <details><summary class="note" style="cursor:pointer">Setting up LM Studio</summary><ol class="stylist" style="padding-left:20px">
        <li>In LM Studio, open the <b>Developer</b> tab and turn the server on (Status: Running). The address is usually http://localhost:1234.</li>
        <li>In the server <b>Settings</b>, turn on <b>Enable CORS</b>. Without it, LM Studio refuses requests from Citekeep.</li>
        <li>Load your model with a <b>context length of 32768 or more</b> (in the load settings before you click Load). A journal article needs about 15,000 to 25,000 tokens; the usual default of 4096 cuts most of it off. Enter the same number in the box above.</li>
        <li>Click Test connection, pick your model, and you're set.</li></ol></details>` : `
      <label class="f"><span>Claude API key</span><input type="password" id="aiKey" placeholder="${s.hasKey ? "Saved. Enter a new key to replace it." : "sk-ant-…"}"></label>
      <label class="f"><span>Model</span><select id="aiClaudeModel"><option value="claude-sonnet-5-5" ${s.claudeModel !== "claude-opus-5-5" ? "selected" : ""}>Claude Sonnet 5.5 (about 5 cents per article)</option><option value="claude-opus-5-5" ${s.claudeModel === "claude-opus-5-5" ? "selected" : ""}>Claude Opus 5.5 (about 10 cents per article)</option></select></label>
      <div class="row"><button class="btn" id="aiKeySave">Save key</button>${s.hasKey ? `<button class="copy" id="aiKeyClear">Remove key</button>` : ""}<span class="note">Create a key at console.anthropic.com. API use is billed separately from a Claude subscription. Each drafted article is sent to Anthropic.</span></div>`}
    <details><summary class="note" style="cursor:pointer">Instructions given to the AI${s.rules ? " (edited)" : ""}</summary>
      <p class="note">These rules go to the model with every article. Change them to suit your field or your instructor's matrix; the model must still return the five fields.</p>
      <textarea id="aiRules" rows="14" style="width:100%;font:inherit;font-size:13px">${esc(s.rules || MX_SYSTEM)}</textarea>
      <div class="row"><button class="btn" id="aiRulesSave">Save instructions</button><button class="copy" id="aiRulesReset">Reset to the default</button></div>
    </details>`;
  const rs = $("#aiRulesSave"); if (rs) rs.onclick = async () => { const v = $("#aiRules").value.trim(); s.rules = v === MX_SYSTEM.trim() ? "" : v; await aiSet("aiRules", s.rules); toast("Instructions saved"); renderAiSettings(); };
  const rr = $("#aiRulesReset"); if (rr) rr.onclick = async () => { s.rules = ""; await aiSet("aiRules", ""); toast("Back to the default instructions"); renderAiSettings(); };
  c.querySelectorAll("input[name=aiProv]").forEach(r => r.onchange = async () => { s.provider = r.value; await aiSet("aiProvider", r.value); renderMatrix(); });
  const u = $("#aiUrl"); if (u) u.onchange = async () => { s.url = u.value.trim() || "http://localhost:1234"; await aiSet("aiUrl", s.url); };
  const md = $("#aiModel"); if (md) md.onchange = async () => { s.model = md.value; await aiSet("aiModel", s.model); };
  const cx = $("#aiCtx"); if (cx) cx.onchange = async () => { s.ctx = Math.max(4096, +cx.value || 32768); await aiSet("aiCtx", String(s.ctx)); };
  const t = $("#aiTest"); if (t) t.onclick = async () => {
    const n = $("#aiTestNote"); n.textContent = "Checking…";
    try {
      const r = await fetch(s.url.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1/models");
      const j = await r.json(); const ids = (j.data || []).map(x => x.id).filter(x => !/embed/i.test(x));
      if (!ids.length) { n.textContent = "Connected, but no model is loaded. Load one in LM Studio."; return; }
      if (!s.model || !ids.includes(s.model)) { s.model = ids[0]; await aiSet("aiModel", s.model); }
      $("#aiModel").innerHTML = ids.map(x => `<option value="${esc(x)}" ${x === s.model ? "selected" : ""}>${esc(x)}</option>`).join("");
      AI.testNote = `Connected. ${ids.length} model${ids.length === 1 ? "" : "s"} available.`;
      await renderMatrix();
    } catch (e) { n.textContent = "Couldn't reach LM Studio. Check that the server is running and Enable CORS is on."; }
  };
  const ks = $("#aiKeySave"); if (ks) ks.onclick = async () => { const k = $("#aiKey").value.trim(); if (!/^sk-ant-/.test(k)) { toast("That doesn't look like a Claude API key (they start with sk-ant-)."); return; } await aiSet("claudeKey", k); s.hasKey = true; toast("Key saved"); renderMatrix(); };
  const kc = $("#aiKeyClear"); if (kc) kc.onclick = async () => { await aiSet("claudeKey", ""); s.hasKey = false; toast("Key removed"); renderMatrix(); };
  const cm = $("#aiClaudeModel"); if (cm) cm.onchange = async () => { s.claudeModel = cm.value; await aiSet("claudeModel", cm.value); };
}
async function mxBatch() {
  if (AI.batch) { AI.batch.stop = true; if (AI.ctrl) AI.ctrl.abort(); return; }
  const rows = matrixRows().filter(r => itemPdfLocal(r) && (!mxHas(r) || ["sample", "design", "findings"].some(k => !r.mx[k])));
  if (!rows.length) return;
  AI.batch = { stop: false }; let done = 0, ok = 0, cut = 0; const fails = [];
  renderMatrix();
  for (const r of rows) {
    if (AI.batch.stop) break;
    $("#mxProg").textContent = `Drafting ${done + 1} of ${rows.length}: ${mxAuthorCell(r)}…`;
    const it = items.find(x => x.id === r.id);
    const res = await aiDraftItem(it || r);
    done++;
    if (res.ok) { ok++; if (res.cut) cut++; } else if (res.error !== "Stopped.") fails.push(`${mxAuthorCell(r)}: ${res.error}`);
    if (fails.length >= 3 && !ok) break; // the model isn't answering; don't grind through the rest
    renderMatrix();
  }
  const stopped = AI.batch.stop; AI.batch = null;
  $("#mxProg").innerHTML = `${stopped ? "Stopped. " : ""}Drafted ${ok} row${ok === 1 ? "" : "s"}${cut ? `; ${cut} article${cut === 1 ? " was" : "s were"} too long for the context length, so their middle sections were left out` : ""}. Review the drafts in each reference's Matrix row.` + (fails.length ? `<ul class="stylist">${fails.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : "");
  renderMatrix(); renderList();
}

// ---------- import a matrix from Word ----------
function cellText(tc) { return [...tc.getElementsByTagNameNS(WNS, "p")].map(paraText).join("\n").trim(); }
async function mxImport(file) {
  const out = $("#mxReport");
  try {
    out.innerHTML = `<p class="note">Reading ${esc(file.name)}…</p>`;
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml").async("string");
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    // bring in its reference list first, as opening any document does
    let pulled = 0;
    const res0 = checkDocument(dom, items.map(x => Object.assign({}, x)));
    if (res0.hasRefHeading && res0.entries.length) {
      const src = res0.lib ? res0.lib.notInLib.map(x => x.entry) : res0.entries;
      const tag = file.name.replace(/\.docx$/i, "");
      const list = src.map(e => { const x = e.ref; const it = { type: x.type, authors: x.authors, year: x.year, suffix: x.suffix, date: x.date, title: x.title, refHtml: runHtml(e.p), useRaw: true, tags: [tag] }; for (const k of ["doi", "url", "legal"]) if (x[k]) it[k] = x[k]; return it; });
      if (list.length) pulled = (await addMany(list)).added || 0;
      if (!memMode) await new Promise(r => setTimeout(r, 300));
    }
    const lib = items.map(x => Object.assign({}, x)); assignSuffixes(lib);
    const LF = buildFormIndex(lib.map(it => ({ id: it.id, year: it.year ? it.year + (it._suffix || "") : "n.d.", forms: itemForms(it) })));
    const tbl = dom.getElementsByTagNameNS(WNS, "tbl")[0];
    if (!tbl) { out.innerHTML = `<p class="banner">${esc(file.name)} has no table, so there's no matrix to import.</p>`; return; }
    const rows = [...tbl.getElementsByTagNameNS(WNS, "tr")];
    const parsed = [], unmatched = [];
    for (const tr of rows) {
      const tcs = [...tr.childNodes].filter(n => n.localName === "tc");
      if (tcs.length < 8) continue;
      const c = tcs.map(cellText);
      if (/^author/i.test(c[0]) || !c[0]) continue;
      const r = findCitations(c[0], LF);
      const id = r.spans.length ? r.spans[0][2] : null;
      const method = /\S/.test(c[4]) ? "MIX" : /\S/.test(c[3]) ? "QUAL" : /\S/.test(c[2]) ? "QUAN" : "";
      const row = { sample: c[1], method, framework: c[5], design: c[6], findings: c[7] };
      if (id) parsed.push([id, row, c[0]]); else unmatched.push(c[0]);
    }
    const clash = parsed.filter(([id, row]) => { const it = items.find(x => x.id === id); return it && mxHas(it) && ["sample", "framework", "design", "findings"].some(k => it.mx[k] && it.mx[k] !== row[k]); });
    if (clash.length && !confirm(`${clash.length} reference${clash.length === 1 ? " already has" : "s already have"} a different matrix row in Citekeep. Replace ${clash.length === 1 ? "it" : "them"} with the rows from ${file.name}?`)) {
      const ids = new Set(clash.map(x => x[0])); for (let i = parsed.length - 1; i >= 0; i--) if (ids.has(parsed[i][0])) parsed.splice(i, 1);
    }
    const seen = new Set(); let n = 0;
    for (const [id, row] of parsed) {
      if (seen.has(id)) continue; seen.add(id);
      const it = items.find(x => x.id === id); if (!it) continue;
      await saveItem(Object.assign({}, it, { mx: Object.assign(row, { draft: {} }) })); n++;
    }
    mxImportReport = `<div class="allgood">Imported ${n} matrix row${n === 1 ? "" : "s"} from ${esc(file.name)}${pulled ? `, and added ${pulled} new reference${pulled === 1 ? "" : "s"} from its reference list` : ""}.</div>` + (unmatched.length ? `<p class="note">${unmatched.length} row${unmatched.length === 1 ? "" : "s"} didn't match a reference in your library:</p><ul class="stylist">${unmatched.map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : "");
    renderMatrix(); renderList();
  } catch (e) { out.innerHTML = `<p class="banner">Couldn't read that file. Make sure it's a Word .docx with the matrix table in it.</p>`; }
}

// ---------- save the matrix as Word ----------
function mxXmlEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
async function mxSaveDocx() {
  const rows = matrixRows(); if (!rows.length || !downloads) return;
  const drafts = rows.reduce((n, r) => n + mxDrafts(r), 0);
  if (drafts && !confirm(`${drafts} cell${drafts === 1 ? " is" : "s are"} still drafts you haven't accepted. Save the matrix with ${drafts === 1 ? "it" : "them"} included?`)) return;
  const title = ($("#mxTitle").value || "").trim() || "Review of Empirical Research";
  await aiSet("matrixTitle", title); if (AI.settings) AI.settings.title = title;
  const W = [1202, 2441, 746, 787, 825, 2497, 2410, 3564];
  const F = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`;
  const rpr = (b) => `<w:rPr>${F}${b ? "<w:b/>" : ""}<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>`;
  const SHD = `<w:shd w:val="clear" w:color="auto" w:fill="DAEEF3"/>`;
  const para = (text, { b = false, center = false } = {}) => String(text || "").split(/\n/).map(line => `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${center ? `<w:jc w:val="center"/>` : ""}</w:pPr>${line ? `<w:r>${rpr(b)}<w:t xml:space="preserve">${mxXmlEsc(line)}</w:t></w:r>` : ""}</w:p>`).join("");
  const tc = (i, inner, extra = "") => `<w:tc><w:tcPr><w:tcW w:w="${W[i]}" w:type="dxa"/>${extra}</w:tcPr>${inner}</w:tc>`;
  const head1 = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${tc(0, para("Author(s)", { b: 1, center: 1 }), `<w:vMerge w:val="restart"/>${SHD}`)}${tc(1, para("Sample", { b: 1, center: 1 }), `<w:vMerge w:val="restart"/>${SHD}`)}<w:tc><w:tcPr><w:tcW w:w="${W[2] + W[3] + W[4]}" w:type="dxa"/><w:gridSpan w:val="3"/>${SHD}</w:tcPr>${para("Methodology", { b: 1, center: 1 })}</w:tc>${tc(5, para("Theoretical Framework / Constructs", { b: 1, center: 1 }), `<w:vMerge w:val="restart"/>${SHD}`)}${tc(6, para("Design / Data Analysis", { b: 1, center: 1 }), `<w:vMerge w:val="restart"/>${SHD}`)}${tc(7, para("Findings", { b: 1, center: 1 }), `<w:vMerge w:val="restart"/>${SHD}`)}</w:tr>`;
  const head2 = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${tc(0, para(""), "<w:vMerge/>")}${tc(1, para(""), "<w:vMerge/>")}${tc(2, para("QUAN", { b: 1, center: 1 }), SHD)}${tc(3, para("QUAL", { b: 1, center: 1 }), SHD)}${tc(4, para("MIX", { b: 1, center: 1 }), SHD)}${tc(5, para(""), "<w:vMerge/>")}${tc(6, para(""), "<w:vMerge/>")}${tc(7, para(""), "<w:vMerge/>")}</w:tr>`;
  const body = rows.map(it => { const m = it.mx || {}; return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(0, para(mxAuthorCell(it), { b: 1 }))}${tc(1, para(m.sample))}${MX_METHODS.map((x, i) => tc(2 + i, para(m.method === x ? "X" : "", { center: 1 }))).join("")}${tc(5, para(m.framework))}${tc(6, para(m.design))}${tc(7, para(m.findings))}</w:tr>`; }).join("");
  const B = `w:val="single" w:sz="4" w:space="0" w:color="7F7F7F"`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${W.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders><w:top ${B}/><w:left ${B}/><w:bottom ${B}/><w:right ${B}/><w:insideH ${B}/><w:insideV ${B}/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="72" w:type="dxa"/><w:right w:w="72" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${head1}${head2}${body}</w:tbl>`;
  const refs = rows.map(it => `<w:p><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/><w:ind w:left="720" w:hanging="720"/></w:pPr>${runsXml(formatReference(it))}</w:p>`).join("");
  const titleP = `<w:p><w:pPr><w:spacing w:after="160"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${mxXmlEsc(title)}</w:t></w:r></w:p>`;
  const refHead = `<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:after="0" w:line="480" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>References</w:t></w:r></w:p>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${titleP}${table}${refHead}${refs}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="792" w:right="792" w:bottom="792" w:left="792" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`);
  zip.file("word/footer1.xml", footer);
  zip.file("word/document.xml", doc);
  try {
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    await downloads.save({ filename: title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) + ".docx", data: blob }); toast("Saved");
  } catch (e) { if (e.code !== "declined") toast("Couldn't save the file."); }
}

// ---------- wiring ----------
(function () {
  const go = () => {
    if (!$("#tab-matrix")) return;
    $("#mxSrc").addEventListener("change", renderMatrix);
    $("#mxOnly").addEventListener("change", renderMatrix);
    $("#mxSave").addEventListener("click", mxSaveDocx);
    $("#mxBatch").addEventListener("click", mxBatch);
    $("#mxIn").addEventListener("change", e => { const f = e.target.files[0]; if (f) mxImport(f); e.target.value = ""; });
    $("#mxTable").addEventListener("click", e => { const tr = e.target.closest("tr[data-item]"); if (!tr) return; selectedId = tr.dataset.item; editing = false; showTab("library"); renderAll(); setTimeout(() => { const b = $("#mxBox"); if (b) { b.open = true; b.scrollIntoView({ block: "start" }); } }, 50); });
    aiLoad();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
