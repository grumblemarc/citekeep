// ===== Claim check: does the cited PDF support each cited sentence? =====
var CC = { claims: null, running: false, stop: false, ctrl: null, texts: new Map(), only: false };

// split a paragraph into sentences without breaking at "et al.", "e.g.", "p." and the like
function sentenceRanges(t) {
  const out = []; let start = 0;
  const re = /[.?!]["”’)]?\s+/g; let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 6), m.index + 1);
    const next = t.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (/(\bal|\be\.g|\bi\.e|\bp|\bpp|\bvs|\bcf|\bNo|\bVol|\bed|\beds|\bch|U\.S|\b[A-Z])\.$/.test(before)) continue;
    if (/^[a-z0-9(]/.test(next) && !/^\([A-Z]/.test(next)) continue;
    out.push([start, m.index + m[0].length]); start = m.index + m[0].length;
  }
  if (start < t.length) out.push([start, t.length]);
  return out.filter(([a, b]) => t.slice(a, b).trim().length > 15);
}
// every sentence that cites something, with the library items (and PDFs) it cites
function collectClaims(dom, r) {
  const rd = readDocument(dom);
  const F = buildFormIndex(r.entries);
  const itemOf = id => { const e = r.entries.find(x => x.id === id); const h = e && r.lib && r.lib.inLib.find(x => x.entry === e); return h ? items.find(i => i.id === h.itemId) : null; };
  const claims = []; let pi = 0;
  for (const p of rd.bodyParas) {
    pi++;
    const t = paraText(p); if (!t.trim()) continue;
    const spans = findCitations(t, F).spans; if (!spans.length) continue;
    for (const [a, b] of sentenceRanges(t)) {
      const sp = spans.filter(s => s[0] >= a && s[0] < b); if (!sp.length) continue;
      const ids = [...new Set(sp.map(s => s[2]))];
      const srcs = ids.map(itemOf).filter(Boolean);
      // the claim without its citations, for finding passages
      let bare = t.slice(a, b);
      for (const s of sp.slice().sort((x, y) => y[0] - x[0])) bare = bare.slice(0, s[0] - a) + " " + bare.slice(s[1] - a);
      bare = bare.replace(/\(\s*[;,&]*\s*\)/g, " ").replace(/\s+/g, " ").trim();
      claims.push({ key: pi + ":" + a, para: pi, text: t.slice(a, b).trim(), bare, sources: srcs.map(it => ({ id: it.id, cite: citeForms(it).narrative, file: itemPdfLocal(it) ? it.file : "", res: null })), unmatched: ids.length - srcs.length });
    }
  }
  return claims;
}

// ---------- finding the passages that bear on a claim ----------
const CC_STOP = new Set("the a an and or of to in on for with by from at as is are was were be been that this these those which who whom than then their there they it its into across between among more less most least also such not no but both each other only very over under after before while when where how what about within without per".split(" "));
function ccTerms(s) { return fold(s).toLowerCase().replace(/[^a-z0-9.% -]/g, " ").split(/\s+/).map(w => w.replace(/^[.-]+|[.-]+$/g, "")).filter(w => w.length > 2 && !CC_STOP.has(w)); }
async function sourceParas(file) {
  if (CC.texts.has(file)) return CC.texts.get(file);
  let full = "";
  try { full = await readPdfFull(file); } catch (e) { CC.texts.set(file, null); return null; }
  const paras = [];
  full.split(/=== PDF page (\d+) ===\n?/).forEach((chunk, i, arr) => {
    if (i % 2 === 0) return;
    const page = +chunk, body = arr[i + 1] || "";
    for (const p of body.split(/\n\n+/)) { const x = p.replace(/\s+/g, " ").trim(); if (x.length > 40) paras.push({ page, text: x, terms: new Set(ccTerms(x)) }); }
  });
  // drop the reference list: everything after the last "References" heading in the back half
  let cut = paras.length;
  for (let i = paras.length - 1; i > paras.length / 2; i--) if (/^(references|reference list|works cited|bibliography)\b/i.test(paras[i].text)) { cut = i; break; }
  // running heads and footers repeat on every page; leave them out
  const sig = p => p.text.toLowerCase().replace(/\d+/g, "#").slice(0, 80);
  const pagesOf = new Map(); for (const p of paras) { const k = sig(p); (pagesOf.get(k) || pagesOf.set(k, new Set()).get(k)).add(p.page); }
  const out = paras.slice(0, cut).filter(p => !(pagesOf.get(sig(p)).size > 1 && p.text.length < 160));
  CC.texts.set(file, out);
  return out;
}
function topPassages(paras, claim, k) {
  const terms = [...new Set(ccTerms(claim))];
  const nums = (claim.match(/\d+(?:\.\d+)?%?/g) || []).filter(n => !/^(19|20)\d\d$/.test(n));
  const df = new Map(); for (const t of terms) df.set(t, paras.filter(p => p.terms.has(t)).length);
  const scored = paras.map((p, i) => {
    let s = 0; for (const t of terms) if (p.terms.has(t)) s += Math.log(1 + paras.length / (1 + df.get(t)));
    for (const n of nums) if (p.text.includes(n)) s += 4;
    if (/^abstract\b/i.test(p.text)) s *= 0.3;
    return [s, i];
  }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, k).map(x => x[1]).sort((a, b) => a - b);
  return scored.map(i => paras[i]);
}

// ---------- asking the model ----------
const CC_SYSTEM = `You check whether a source supports what a literature-review sentence says about it.

The sentences come from a synthesis: the author paraphrases, generalizes, and often cites several sources in one sentence. Judge meaning, not wording.
- Paraphrase, summary, and generalization are support. Never require the source to use the sentence's words.
- When the sentence cites several sources, judge only the part this source could reasonably be cited for. Other sources cover the rest; that is not a shortcoming of this source.

You get the sentence, the source being checked, the other sources cited with it, and numbered excerpts from this source, each marked with its PDF page.
Verdicts, using only the excerpts:
- "supported": the excerpts support this source's share of the sentence in substance.
- "partly": a specific factual detail attributed to this source is wrong or overstated: a number, the population or setting, the direction of an effect, its size, a causal claim the study did not make, or "all" where the study found "some". Wording differences and other sources' content are never "partly".
- "contradicted": the source says the opposite.
- "not_found": the excerpts do not address this source's share of the sentence.
Rules:
- An abstract is not evidence. If support appears only in an abstract, answer "not_found" and say so.
- Quote the most relevant passage word for word (under 60 words) with its page number; leave quote empty and page 0 for "not_found".
- difference: for "partly" or "contradicted", name the kind of mismatch: number, population, direction, size, causal, scope; otherwise "none".
- note: one plain sentence. For "partly", state exactly what the source says versus the sentence.
Return only a JSON object with the keys verdict, difference, quote, page, note.`;
const CC_SCHEMA = { type: "object", properties: { verdict: { type: "string", enum: ["supported", "partly", "contradicted", "not_found"] }, difference: { type: "string", enum: ["number", "population", "direction", "size", "causal", "scope", "none"] }, quote: { type: "string" }, page: { type: "integer" }, note: { type: "string" } }, required: ["verdict", "difference", "quote", "page", "note"] };
function parseCC(s) {
  s = String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("The model didn't give a verdict.");
  const j = JSON.parse(s.slice(a, b + 1));
  const v = String(j.verdict || "").toLowerCase().replace(/[^a-z_]/g, "");
  const out = { verdict: ["supported", "partly", "contradicted", "not_found"].includes(v) ? v : v.startsWith("part") ? "partly" : v.startsWith("contra") ? "contradicted" : v.startsWith("supp") ? "supported" : "not_found", difference: String(j.difference || "none").toLowerCase(), quote: String(j.quote || "").trim(), page: +j.page || 0, note: String(j.note || "").trim() };
  // "partly" has to name a factual mismatch; wording or other sources' content doesn't count
  const vague = /\b(wording|word|phrase|phrasing|terminology|paraphras|other (sources|studies|citations)|also (mentions|cites|discusses)|broader|general(ly|izes)?|does not (explicitly )?(use|mention) the (term|word|phrase))/i;
  if (out.verdict === "partly" && (!["number", "population", "direction", "size", "causal", "scope"].includes(out.difference) || (out.difference === "scope" && vague.test(out.note)))) { out.verdict = "supported"; out.note = (out.note ? out.note + " " : "") + "(Counted as supported: the difference named was wording or scope, not a factual detail.)"; }
  return out;
}
async function checkOne(claim, src) {
  const paras = await sourceParas(src.file);
  if (!paras || !paras.length) return { verdict: "unreadable", note: "The PDF has no readable text (it may be a scan)." };
  const k = AI.settings.provider === "claude" ? 16 : 12;
  const ex = topPassages(paras, claim.bare, k);
  if (!ex.length) return { verdict: "not_found", quote: "", page: 0, note: "No passage in the PDF shares this sentence's key terms." };
  const it = items.find(x => x.id === src.id);
  const others = claim.sources.filter(x => x.id !== src.id).map(x => x.cite);
  const budget = AI.settings.provider === "claude" ? 1400 : Math.max(500, Math.min(1400, Math.floor(((AI.settings.ctx || 32768) - 3000) * 3 / k)));
  const user = `Sentence: ${claim.text}\n\nSource being checked: ${htmlToText(formatReference(it))}\nOther sources cited in the same sentence: ${others.length ? others.join("; ") : "none"}\n\nExcerpts from the source being checked:\n` + ex.map((p, i) => `[${i + 1}] (PDF page ${p.page}) ${p.text.slice(0, budget)}`).join("\n\n");
  const out = parseCC(await aiComplete(CC_SYSTEM, user, CC.ctrl.signal, CC_SCHEMA, "claim_check"));
  // the quote must really be in the PDF; otherwise don't trust the verdict
  if (out.quote) {
    const q = compactKey(out.quote).slice(0, 80), hit = ex.find(p => compactKey(p.text).includes(q.slice(0, 50)));
    if (!hit) { out.note = (out.note ? out.note + " " : "") + "(The quoted words couldn't be found in the PDF, so treat this verdict with caution.)"; out.unverifiedQuote = true; }
    else if (!out.page) out.page = hit.page;
  }
  return out;
}

// ---------- saved verdicts (Documents\\Citekeep\\claims.json): kept by sentence and source, so they carry over between sittings and versions of a chapter ----------
var CCSTORE = { data: null, timer: null };
async function ccLoadStore() {
  if (CCSTORE.data) return CCSTORE.data;
  try { CCSTORE.data = JSON.parse((await window.citekeepApp.readText("claims.json")) || "{}"); } catch (e) { CCSTORE.data = {}; }
  CCSTORE.data.results = CCSTORE.data.results || {};
  return CCSTORE.data;
}
function ccKey(c, s) { return c.text.replace(/\s+/g, " ").trim() + "|" + s.id; }
function ccRemember(c, s) {
  if (!CCSTORE.data || !s.res || s.res.verdict === "error") return;
  CCSTORE.data.results[ccKey(c, s)] = Object.assign({}, s.res, { at: new Date().toISOString().slice(0, 10) });
  clearTimeout(CCSTORE.timer);
  CCSTORE.timer = setTimeout(() => {
    const R = CCSTORE.data.results, keys = Object.keys(R);
    if (keys.length > 6000) keys.sort((a, b) => (R[a].at || "").localeCompare(R[b].at || "")).slice(0, keys.length - 6000).forEach(k => delete R[k]);
    window.citekeepApp.writeText("claims.json", JSON.stringify(CCSTORE.data)).catch(() => {});
  }, 1200);
}
async function ccRestore() {
  const D = await ccLoadStore(); let n = 0;
  for (const c of CC.claims || []) for (const s of c.sources) { if (s.res || !s.file) continue; const v = D.results[ccKey(c, s)]; if (v) { s.res = v; n++; } }
  return n;
}
function ccClearSaved() {
  if (!CCSTORE.data) return;
  for (const c of CC.claims || []) for (const s of c.sources) delete CCSTORE.data.results[ccKey(c, s)];
  window.citekeepApp.writeText("claims.json", JSON.stringify(CCSTORE.data)).catch(() => {});
}

// ---------- a Word copy of the report ----------
async function ccSaveDocx() {
  const rows = CC.claims.flatMap(c => c.sources.filter(s => s.res).map(s => ({ c, s })));
  if (!rows.length || !downloads) return;
  const X = t => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const F = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
  const run = (t, o = {}) => `<w:r><w:rPr>${F}${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}<w:sz w:val="${o.sz || 18}"/><w:szCs w:val="${o.sz || 18}"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
  const para = (inner, o = {}) => `<w:p><w:pPr><w:spacing w:after="${o.after || 0}" w:line="240" w:lineRule="auto"/>${o.center ? '<w:jc w:val="center"/>' : ""}</w:pPr>${inner}</w:p>`;
  const W = [5200, 1900, 1500, 5500];
  const B = 'w:val="single" w:sz="4" w:space="0" w:color="7F7F7F"';
  const cell = (i, inner, shade) => `<w:tc><w:tcPr><w:tcW w:w="${W[i]}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="DAEEF3"/>' : ""}</w:tcPr>${inner}</w:tc>`;
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${["Sentence", "Source", "Verdict", "Evidence from the PDF"].map((h, i) => cell(i, para(run(h, { b: 1 })), 1)).join("")}</w:tr>`;
  const body = rows.map(({ c, s }) => { const r = s.res, lab = (CC_LABEL[r.verdict] || CC_LABEL.error)[0];
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(0, para(run(c.text)))}${cell(1, para(run(s.cite)))}${cell(2, para(run(lab, { b: r.verdict !== "supported" })))}${cell(3, (r.quote ? para(run("“" + r.quote + "” (PDF page " + (r.page || "?") + ")", { i: 1 })) : "") + (r.note ? para(run(r.note)) : "") || para(""))}</w:tr>`; }).join("");
  const cnt = v => rows.filter(x => x.s.res.verdict === v).length;
  const title = para(run("Claim check: " + (CC.doc || "document").replace(/\.docx$/i, ""), { b: 1, sz: 24 }), { center: 1, after: 80 });
  const sub = para(run(`${new Date().toISOString().slice(0, 10)} · ${rows.length} citations checked against their PDFs · ${cnt("supported")} supported, ${cnt("partly")} partly supported, ${cnt("contradicted")} contradicted, ${cnt("not_found")} not found in the PDF`, { sz: 20 }), { center: 1, after: 200 });
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${title}${sub}<w:tbl><w:tblPr><w:tblW w:w="${W.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders><w:top ${B}/><w:left ${B}/><w:bottom ${B}/><w:right ${B}/><w:insideH ${B}/><w:insideV ${B}/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${head}${body}</w:tbl><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="792" w:right="792" w:bottom="792" w:left="792" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", doc);
  try { const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }); await downloads.save({ filename: "Claim check - " + (CC.doc || "document").replace(/\.docx$/i, "").replace(/[\\/:*?"<>|]+/g, " ") + ".docx", data: blob }); toast("Saved"); }
  catch (e) { if (e.code !== "declined") toast("Couldn't save the report."); }
}

// ---------- the report ----------
const CC_LABEL = { supported: ["Supported", "ok"], partly: ["Partly supported", "warn"], contradicted: ["Contradicted", "bad"], not_found: ["Not found in the PDF", "bad"], unreadable: ["PDF unreadable", "warn"], error: ["Not checked", "warn"] };
function ccRow(c, i) {
  const list = CC.only ? c.sources.filter(s => s.res && s.res.verdict !== "supported") : c.sources;
  return list.map((s, jj) => {
    const j = c.sources.indexOf(s);
    const r = s.res;
    const verdict = !s.file ? `<span class="note">No PDF linked</span>` : !r ? `<span class="note">${CC.running ? "Waiting…" : "Not checked yet"}</span>` : (([lab, cls]) => `<span class="pill ${cls}">${lab}</span>`)(CC_LABEL[r.verdict] || CC_LABEL.error);
    const rc = r && s.file && !CC.running ? ` <button class="copy" data-ccre="${i}:${j}" title="Ask again">Recheck</button>` : "";
    const ev = r && r.quote ? `“${esc(r.quote)}” <button class="copy" data-ccopen="${i}:${j}">PDF page ${r.page || "?"}</button>` : "";
    return `<tr data-cc="${r ? r.verdict : "none"}">${jj === 0 ? `<td rowspan="${list.length}" style="font-family:var(--serif)">${esc(c.text)}</td>` : ""}<td>${esc(s.cite)}</td><td>${verdict}</td><td>${ev}${r && r.note ? `<div class="note">${esc(r.note)}</div>` : ""}${rc}</td></tr>`;
  }).join("");
}
function renderClaims() {
  const box = $("#ccOut"); if (!box || !CC.claims) return;
  const all = CC.claims.flatMap(c => c.sources);
  const withPdf = all.filter(s => s.file), done = withPdf.filter(s => s.res);
  const count = v => done.filter(s => s.res.verdict === v).length;
  const probs = CC.claims.filter(c => c.sources.some(s => s.res && !["supported"].includes(s.res.verdict)));
  const shown = CC.only ? probs : CC.claims.filter(c => c.sources.some(s => s.file));
  box.innerHTML = `${done.length ? `<div class="stats">${[["supported", "supported", "ok"], ["partly", "partly supported", "warn"], ["contradicted", "contradicted", "bad"], ["not_found", "not found in the PDF", "bad"]].map(([v, l, c]) => `<div class="stat ${count(v) ? c : ""}"><b>${count(v)}</b><span>${l}</span></div>`).join("")}</div>` : ""}
    <div class="row" style="margin:6px 0">${count("partly") && !CC.running ? `<button class="copy" id="ccRePartly">Recheck all ${count("partly")} “partly”</button>` : ""}<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ccOnly" ${CC.only ? "checked" : ""}>Show only claims that need attention (${probs.length})</label>${done.length ? `<button class="copy" id="ccCopy">Copy report</button>${downloads ? `<button class="copy" id="ccDocx">Save report (.docx)</button>` : ""}<button class="copy" id="ccClear">Clear verdicts</button>` : ""}</div>
    ${shown.length ? `<div class="tbl-wrap" style="max-height:70vh;overflow:auto"><table><thead><tr><th>Sentence</th><th>Source</th><th>Verdict</th><th>Evidence from the PDF</th></tr></thead><tbody>${shown.map(c => ccRow(c, CC.claims.indexOf(c))).join("")}</tbody></table></div>` : `<p class="note">${CC.only ? "Nothing needs attention so far." : "No cited sentences have a linked PDF."}</p>`}`;
  const rp = $("#ccRePartly"); if (rp) rp.onclick = () => { for (const c of CC.claims) for (const s of c.sources) if (s.res && s.res.verdict === "partly") s.res = null; runClaims(); };
  $("#ccOnly").onchange = e => { CC.only = e.target.checked; renderClaims(); };
  const dx = $("#ccDocx"); if (dx) dx.onclick = ccSaveDocx;
  const cl = $("#ccClear"); if (cl) cl.onclick = () => { if (!confirm("Clear the saved verdicts for this document so it can be checked fresh?")) return; ccClearSaved(); for (const c of CC.claims) for (const s of c.sources) s.res = null; renderClaims(); };
  const cp = $("#ccCopy"); if (cp) cp.onclick = () => {
    const lines = CC.claims.flatMap(c => c.sources.filter(s => s.res).map(s => `${(CC_LABEL[s.res.verdict] || CC_LABEL.error)[0].toUpperCase()}: ${c.text}\n  Source: ${s.cite}${s.res.quote ? `\n  Evidence (PDF page ${s.res.page}): "${s.res.quote}"` : ""}${s.res.note ? `\n  ${s.res.note}` : ""}`));
    copyText(lines.join("\n\n"));
  };
  box.querySelectorAll("[data-ccre]").forEach(b => b.onclick = async () => {
    const [i, j] = b.dataset.ccre.split(":").map(Number); const c = CC.claims[i], s = c.sources[j];
    await aiLoad(); if (!aiReady()) { toast("Set up AI in Settings first."); return; }
    b.disabled = true; b.textContent = "Checking…"; CC.ctrl = new AbortController();
    try { s.res = await checkOne(c, s); ccRemember(c, s); } catch (e) { toast(e.message || "The AI didn't answer."); }
    renderClaims();
  });
  box.querySelectorAll("[data-ccopen]").forEach(b => b.onclick = async () => { const [i, j] = b.dataset.ccopen.split(":").map(Number); const s = CC.claims[i].sources[j]; const err = await window.citekeepApp.openPdf(PDF.folder, s.file, s.res.page); if (err) toast("Couldn't open the PDF."); });
}
async function runClaims() {
  const btn = $("#ccGo");
  if (CC.running) { CC.stop = true; if (CC.ctrl) CC.ctrl.abort(); return; }
  await aiLoad();
  if (!aiReady()) { toast("Set up AI in Settings first (LM Studio or a Claude key)."); showTab("settings"); return; }
  const todo = CC.claims.flatMap(c => c.sources.filter(s => s.file && !s.res).map(s => [c, s]));
  if (!todo.length) { toast("Every claim with a PDF has been checked."); return; }
  CC.running = true; CC.stop = false; btn.textContent = "Stop";
  let n = 0, fails = 0; const t0 = Date.now();
  for (const [c, s] of todo) {
    if (CC.stop) break;
    $("#ccProg").textContent = `Checking ${++n} of ${todo.length}… (${Math.round((Date.now() - t0) / 1000)} s)`;
    CC.ctrl = new AbortController();
    try { s.res = await checkOne(c, s); ccRemember(c, s); fails = 0; }
    catch (e) { if (e.name === "AbortError") break; s.res = { verdict: "error", note: e.message || "The model didn't answer." }; if (++fails >= 3) { toast(e.message || "The AI stopped answering."); break; } }
    if (n % 3 === 0 || n === todo.length) renderClaims();
  }
  CC.running = false; CC.ctrl = null; btn.textContent = "Check claims";
  $("#ccProg").textContent = CC.stop ? "Stopped. Click Check claims to continue where it left off." : `Done in ${Math.round((Date.now() - t0) / 1000)} s.`;
  renderClaims();
}
function afterRenderCheck3(r) {
  const out = $("#checkOut"); if (!out || !r || !r.hasRefHeading || typeof readPdfFull !== "function") return;
  if (!CC.claims || CC.check !== lastCheck) {
    // a newly opened document (or the same one again, perhaps with more PDFs linked): keep verdicts already reached for the same sentence and source
    const prev = new Map(); if (CC.claims && CC.doc === lastCheck.name) for (const c of CC.claims) for (const s of c.sources) if (s.res) prev.set(c.text + "|" + s.id, s.res);
    try { CC.claims = collectClaims(new DOMParser().parseFromString(lastCheck.xml, "application/xml"), r); } catch (e) { return; }
    for (const c of CC.claims) for (const s of c.sources) { const v = prev.get(c.text + "|" + s.id); if (v && s.file) s.res = v; }
    CC.check = lastCheck; CC.doc = lastCheck.name; CC.texts = new Map();
    // bring back verdicts saved in earlier sittings (also for unchanged sentences in a newer version of the chapter)
    ccRestore().then(n => { if (n && $("#ccOut")) { const p = $("#ccProg"); if (p) p.textContent = `${n} verdict${n === 1 ? "" : "s"} restored from earlier checks.`; renderClaims(); } }).catch(() => {});
  }
  const all = CC.claims.flatMap(c => c.sources), withPdf = all.filter(s => s.file);
  const sec = document.createElement("div");
  sec.innerHTML = `<h3>Check claims against your PDFs</h3>
    <p class="note" style="margin-top:0">For each sentence that cites a source, Citekeep finds the passages in that source's PDF that bear on it and asks the AI whether they support the sentence. Each verdict quotes the passage and gives its page so you can check it. Abstracts don't count as support. This uses the AI set up in Settings; on LM Studio expect several seconds per citation.</p>
    <div class="row"><button class="btn" id="ccGo" ${withPdf.length ? "" : "disabled"}>${CC.running ? "Stop" : "Check claims"}</button><span class="note">${CC.claims.length} cited sentences; ${withPdf.length} of ${all.length} citations have a linked PDF${all.length - withPdf.length ? ` (link more in Settings → Your PDFs)` : ""}.</span></div>
    <div class="note" id="ccProg" style="margin:6px 0"></div><div id="ccOut"></div>`;
  const anchor = out.querySelector("details.doclist");
  anchor ? out.insertBefore(sec, anchor) : out.appendChild(sec);
  $("#ccGo").onclick = runClaims;
  if (CC.claims.some(c => c.sources.some(s => s.res))) renderClaims();
}
