// ===== Citekeep UI =====
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
let items = [];            // [{id, ...fields}]
let selectedId = null, editing = false, filter = { q: "", type: "", tag: "" };
let col = null, memMode = false, downloads = null, sampleApi = null;
let lastCheck = null;
let draft = null;          // prefilled reference waiting for review      // {name, xml, zip, result}

const TYPE_LABEL = { article: "Journal article", book: "Book", chapter: "Book chapter", report: "Report", webpage: "Web page", legal: "Law", other: "Other" };

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
async function copyText(text, html) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    } else await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied"); } catch { toast("Select the text and copy it by hand"); }
    ta.remove();
  }
}
function htmlToText(h) { const d = document.createElement("div"); d.innerHTML = h; return d.textContent; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function dedupKey(it) {
  const a = (it.authors || [])[0];
  const who = it.type === "legal" ? it.title : a ? (a.org || a.family) : it.title;
  return [norm(who).toLowerCase(), it.year || "", norm(it.title).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)].join("|");
}

// ---------- storage ----------
const LS_KEY = "citekeep.library.v1";
let saveBusy = false, saveDirty = false;
function libJson() { return JSON.stringify(items.map(x => { const { _suffix, ...r } = x; return r; })); }
async function persist() {
  saveDirty = true;
  if (saveBusy) return;
  saveBusy = true;
  try {
    while (saveDirty) { saveDirty = false; await window.citekeepApp.saveLibrary(libJson()); }
  } catch { toast("Couldn't save your library file."); setStatus(false, "Not saved"); }
  saveBusy = false;
}
window.citekeepFlush = async () => { await window.citekeepApp.saveLibrary(libJson()); };
window.addEventListener("beforeunload", () => { if (saveBusy || saveDirty) { try { window.citekeepApp.saveLibrarySync(libJson()); } catch {} } });
async function initStore() {
  memMode = true;
  downloads = { save: async ({ filename, data }) => {
    let payload = data;
    if (data instanceof Blob) payload = new Uint8Array(await data.arrayBuffer());
    else if (data instanceof ArrayBuffer) payload = new Uint8Array(data);
    const where = await window.citekeepApp.saveFile(filename, payload);
    if (!where) throw { code: "declined" };
    window.citekeepApp.showFile(where);
    return { status: "saved" };
  } };
  let raw = null;
  try { raw = await window.citekeepApp.loadLibrary(); } catch {}
  if (raw) { try { items = JSON.parse(raw); } catch { items = []; } }
  setStatus(true, "Saved to Documents\\Citekeep");
  loaded = true; renderAll();
  // first launch of this install: ask before taking over a library that's already there
  try {
    const st = await window.citekeepApp.getSettings();
    if (!st.libraryChoice && window.citekeepApp.setSetting) {
      if (!items.length) await window.citekeepApp.setSetting("libraryChoice", "new");
      else firstRunChoice();
    }
  } catch (e) {}
}

function firstRunChoice() {
  const n = items.length;
  const box = document.createElement("div");
  box.className = "modal-back";
  box.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="frT"><h2 id="frT" style="margin:0 0 6px">Welcome to Citekeep</h2>
    <p style="margin:0 0 12px">Citekeep found a library in Documents\\Citekeep with <b>${n} reference${n === 1 ? "" : "s"}</b>, saved by an earlier copy of Citekeep on this computer.</p>
    <div style="display:grid;gap:8px"><button class="btn primary" id="frKeep">Use this library</button><button class="btn" id="frNew">Start a new, empty library</button></div>
    <p class="note" style="margin:12px 0 0">Starting new keeps the old library as a dated backup file in the same folder; nothing is deleted. You won't be asked again.</p></div>`;
  document.body.appendChild(box);
  box.querySelector("#frKeep").onclick = async () => { await window.citekeepApp.setSetting("libraryChoice", "keep"); box.remove(); };
  box.querySelector("#frNew").onclick = async () => {
    const name = await window.citekeepApp.archiveLibrary();
    if (!name) { toast("Couldn't set the old library aside, so it was kept."); return; }
    items = []; selectedId = null; await window.citekeepApp.saveLibrary("[]");
    await window.citekeepApp.setSetting("libraryChoice", "new");
    box.remove(); renderAll(); toast("Started a new library. The old one is saved as " + name + ".");
  };
}
let loaded = false;
function setStatus(on, text) { $("#storeDot").className = "dot " + (on ? "on" : "off"); $("#storeText").textContent = text || (on ? "Library saved to your account" : "Not saved"); }
async function withRetry(fn) {
  for (let i = 0; i < 4; i++) {
    try { return await fn(); } catch (e) {
      if (e && (e.code === "resource_exhausted" || e.code === "unavailable") && i < 3) { await new Promise(r => setTimeout(r, 800 + Math.random() * 1200 * (i + 1))); continue; }
      throw e;
    }
  }
}
async function saveItem(it) {
  const { id, _suffix, ...data } = it;
  for (const k of Object.keys(data)) if (data[k] === undefined || data[k] === "" && !["title"].includes(k)) delete data[k];
  data.updated = Date.now(); if (!data.created) data.created = data.updated;
  if (memMode) {
    const i = items.findIndex(x => x.id === id);
    const full = { id, ...data };
    if (i >= 0) items[i] = full; else items.push(full);
    persist(); renderAll(); return id;
  }
  await withRetry(() => col.doc(id).set(data));
  return id;
}
function newId() { return memMode || !col ? "m" + Math.random().toString(36).slice(2, 10) : col.doc().id; }
async function deleteItem(id) {
  if (memMode) { items = items.filter(x => x.id !== id); persist(); renderAll(); return; }
  await withRetry(() => col.doc(id).delete());
}
async function addMany(list, noteEl) {
  const have = new Set(items.map(dedupKey));
  let added = 0, skipped = 0;
  for (const it of list) {
    const k = dedupKey(it);
    if (have.has(k)) { skipped++; continue; }
    have.add(k);
    it.id = newId(); it.tags = it.tags || []; it.created = Date.now() + added;
    try { await saveItem(it); added++; if (noteEl) noteEl.textContent = `Adding… ${added}`; }
    catch (e) { toast(e.code === "quota_exceeded" ? "Your library is full." : "Some references couldn't be saved. Try again."); break; }
  }
  return { added, skipped };
}

// ---------- tabs ----------
$$("nav.tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
function showTab(name) {
  $$("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  ["library", "check", "bib", "matrix", "io", "settings", "help"].forEach(n => { const s = $("#tab-" + n); if (s) s.hidden = n !== name; });
  if (name === "settings") setTimeout(() => { if (typeof AI !== "undefined" && AI && typeof aiLoad === "function") aiLoad().then(() => { if (typeof renderAiSettings === "function") renderAiSettings(); }); if (typeof renderPdfCard === "function") renderPdfCard(); if (typeof renderDataCard === "function") renderDataCard(); }, 0);
  if (name === "bib") renderBib();
  if (name === "matrix" && typeof renderMatrix === "function") renderMatrix();
  try { localStorage.setItem("ck-tab", name); } catch {}
}

// ---------- library ----------
function sorted() {
  const all = items.map(x => x);
  assignSuffixes(all);
  return all.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
function matches(it) {
  if (filter.type && (it.type || "other") !== filter.type) return false;
  if (filter.tag && !(it.tags || []).some(t => t === filter.tag || t.startsWith(filter.tag + "/"))) return false;
  if (!filter.q) return true;
  if (typeof ftMatchItem === "function" && ftMatchItem(it)) return true;
  const hay = [htmlToText(formatReference(it)), (it.tags || []).join(" "), it.notes || "", citeForms(it).parenthetical].join(" ").toLowerCase();
  return filter.q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}
function renderAll() { renderTags(); renderList(); if (!window.__mxQuiet) renderDetail(); if (!$("#tab-bib").hidden) renderBib(); if (typeof renderPdfCard === "function") renderPdfCard(); }
function allTags() { return [...new Set(items.flatMap(i => i.tags || []))].sort(); }
function renderTags() {
  const sel = $("#fTag"), cur = sel.value;
  const list = typeof tagTree === "function" ? tagTree() : allTags();
  sel.innerHTML = `<option value="">All tags</option>` + list.map(t => { const d = t.split("/").length - 1; return `<option value="${esc(t)}" ${t === cur ? "selected" : ""}>${"\u00a0\u00a0\u00a0".repeat(d)}${esc(t.split("/").pop())}</option>`; }).join("");
}
function renderList() {
  const list = $("#list");
  const S = sorted();
  const shown = S.filter(matches);
  $("#count").textContent = items.length ? `${shown.length} of ${items.length} references` : "";
  if (!items.length) {
    list.innerHTML = `<div class="empty"><b>${!loaded && !memMode ? "Opening your library…" : "No references yet"}</b>${!loaded && !memMode ? "" : "Open a Word document and Citekeep pulls in its reference list, or add references one at a time with New or Look up."}</div>`;
    return;
  }
  if (!shown.length) { list.innerHTML = `<div class="empty"><b>No matches</b>Try fewer words or clear the filters.</div>`; return; }
  list.innerHTML = shown.map(it => `<button class="item" data-id="${it.id}" aria-current="${it.id === selectedId}"><div class="cite">${esc(citeForms(it).parenthetical)}${it.file ? ` <span class="chip" style="font-size:10px;padding:0 6px">PDF</span>` : ""}</div><div class="ttl">${esc(it.title || htmlToText(it.refHtml || ""))}</div>${typeof FT !== "undefined" && FT.on && filter.q && it.file ? (n => n ? `<div class="note">${n} page${n === 1 ? "" : "s"} in the PDF</div>` : "")(ftHits(it.file, filter.q).length) : ""}</button>`).join("");
}
$("#list").addEventListener("click", e => { const b = e.target.closest(".item"); if (!b) return; selectedId = b.dataset.id; editing = false; renderList(); renderDetail(); if (innerWidth < 860) $("#detail").scrollIntoView({ behavior: "smooth", block: "start" }); });
$("#q").addEventListener("input", e => { filter.q = e.target.value.trim(); renderList(); });
$("#fType").addEventListener("change", e => { filter.type = e.target.value; renderList(); });
$("#fTag").addEventListener("change", e => { filter.tag = e.target.value; renderList(); });
$("#openDocBtn").addEventListener("click", () => { showTab("check"); $("#docIn").click(); });
$("#newBtn").addEventListener("click", () => { selectedId = null; editing = true; renderList(); renderDetail(); });
async function runLookup() {
  const inp = $("#lookupIn"), btn = $("#lookupBtn");
  if (!inp.value.trim()) { toast("Paste a DOI or ISBN first"); return; }
  btn.disabled = true; btn.textContent = "Looking up…";
  try {
    const it = await lookupAny(inp.value);
    const dupe = items.find(x => dedupKey(x) === dedupKey(it) || (it.doi && x.doi && x.doi.toLowerCase() === it.doi.toLowerCase()));
    if (dupe) { selectedId = dupe.id; editing = false; toast("That reference is already in your library"); }
    else { selectedId = null; editing = true; draft = it; toast("Found it. Check the details, then save."); }
    inp.value = ""; renderList(); renderDetail();
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = "Look up";
}
if ($("#lookupBtn")) { $("#lookupBtn").addEventListener("click", runLookup); $("#lookupIn").addEventListener("keydown", e => { if (e.key === "Enter") runLookup(); }); }

function formRow(label, value) {
  return `<div class="form"><div style="min-width:0"><small>${label}</small><code>${esc(value)}</code></div><button class="copy" data-copy="${esc(value)}">Copy</button></div>`;
}
function renderDetail() {
  const d = $("#detail");
  const it = items.find(x => x.id === selectedId);
  if (editing) { const base = draft || (it ? clone(it) : { type: "article", authors: [], tags: [] }); draft = null; d.innerHTML = editorHtml(base); bindEditor(it || base); return; }
  if (!it) {
    d.innerHTML = `<div class="empty"><b>${items.length ? "Pick a reference" : "Your catalog starts here"}</b>${items.length ? "Select a reference to see its APA entry and in-text citations, or add a new one." : "Each reference you add shows its APA entry and the in-text citations to type, ready to copy."}</div>`;
    return;
  }
  const all = sorted(); const me = all.find(x => x.id === it.id) || it;
  const f = citeForms(me);
  d.innerHTML = `<div class="detail">
    <div class="row" style="justify-content:space-between"><span class="pill ok">${esc(TYPE_LABEL[it.type] || "Other")}</span>
      <div class="row"><button class="btn" id="editBtn">Edit</button><button class="btn danger" id="delBtn">Delete</button></div></div>
    <div class="refcard" data-item="${it.id}">${linkDOIs(formatReference(me))}</div>
    ${typeof noticeHtml === "function" ? noticeHtml(it) : ""}
    <div class="row" id="copyRow"></div>
    ${typeof ftDetail === "function" ? ftDetail(it) : ""}
    <div class="row"><button class="btn" id="copyRef">Copy reference</button>${it.refHtml && it.useRaw !== false ? `<span class="note">Your exact wording is used. Edit to switch to field-based formatting.</span>` : ""}</div>
    <h3 style="margin:6px 0 0">In-text citations</h3>
    <div class="forms">${formRow("Parenthetical", f.parenthetical)}${formRow("Narrative", f.narrative)}${f.parentheticalFirst ? formRow("First use, parenthetical", f.parentheticalFirst) + formRow("First use, narrative", f.narrativeFirst) : ""}</div>
    ${typeof matrixHtml === "function" ? matrixHtml(me) : ""}
    ${(it.tags || []).length ? `<div class="chips">${it.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
    ${it.notes ? `<div><h3 style="margin:6px 0 4px">Notes</h3><div style="white-space:pre-wrap">${esc(it.notes)}</div></div>` : ""}
  </div>`;
  $("#editBtn").onclick = () => { editing = true; renderDetail(); };
  const del = $("#delBtn");
  del.onclick = async () => {
    if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Confirm delete"; setTimeout(() => { if (del.isConnected) { del.classList.remove("armed"); del.textContent = "Delete"; } }, 4000); return; }
    await deleteItem(it.id).catch(() => toast("Couldn't delete. Try again."));
    selectedId = null; toast("Reference deleted"); renderAll();
  };
  if (typeof renderCopyRow === "function") renderCopyRow(it);
  if (typeof bindMatrix === "function") bindMatrix(it);
  $("#copyRef").onclick = () => copyText(htmlToText(formatReference(me)), `<p style="font-family:'Times New Roman';font-size:12pt">${formatReference(me)}</p>`);
}
$("#detail").addEventListener("click", e => { const c = e.target.closest("[data-copy]"); if (c) copyText(c.dataset.copy); });

function authorsToText(a) { return (a || []).map(x => x.org ? x.org + (x.abbr ? " | " + x.abbr : "") : x.family + (x.given ? ", " + x.given : "") + (x.suffix ? ", " + x.suffix : "")).join("\n"); }
function textToAuthors(t) {
  return t.split(/\n+/).map(s => s.trim()).filter(Boolean).map(s => {
    if (s.includes("|")) { const [o, ab] = s.split("|").map(x => x.trim()); return ab ? { org: o, abbr: ab } : { org: o }; }
    if (s.includes(",")) { const [f, g, suf] = s.split(",").map(x => x.trim()); const o = { family: f, given: initials(g || "") }; if (suf) o.suffix = suf; return o; }
    return { org: s };
  });
}
function fld(id, label, val, attrs = "") { return `<label class="f"><span>${label}</span><input type="text" id="e_${id}" value="${esc(val || "")}" ${attrs}></label>`; }
function editorHtml(it) {
  const t = it.type || "article";
  const contLabel = { article: "Journal", chapter: "Book title", webpage: "Website name", book: "Series (optional)", report: "Series (optional)", other: "Source", legal: "Source" }[t];
  return `<div class="detail">
    <h2>${it.id ? "Edit reference" : "New reference"}</h2>
    <div class="grid2">
      <label class="f"><span>Type</span><select id="e_type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${k === t ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${fld("year", "Year", it.year, 'inputmode="numeric" placeholder="2024"')}
      ${fld("suffix", "Year letter (leave blank for automatic)", it.suffix, 'maxlength="1" placeholder="a"')}
      ${fld("date", "Month and day (web pages, news)", it.date, 'placeholder="May 7"')}
    </div>
    ${t === "legal" ? "" : `<label class="f"><span>Authors — one per line: Family, Given. A group author goes on its own line, with an abbreviation after a bar: Knox County Schools | KCS</span><textarea id="e_authors" rows="4">${esc(authorsToText(it.authors))}</textarea></label>`}
    <label class="f"><span>${t === "legal" ? "Name of the act" : "Title"}${typeof sentenceCase !== "undefined" && t !== "legal" ? ` <button class="copy" id="scBtn" type="button" style="text-transform:none;letter-spacing:0">Make sentence case</button>` : ""}</span><input type="text" id="e_title" value="${esc(it.title || "")}"></label>
    <div class="grid2">
      ${t === "legal" ? fld("legal", "Public law or chapter", it.legal, 'placeholder="Pub. L. No. 114-95, 129 Stat. 1802"') : fld("container", contLabel, it.container)}
      ${t === "article" ? fld("volume", "Volume", it.volume) + fld("issue", "Issue", it.issue) : ""}
      ${["article", "chapter"].includes(t) ? fld("pages", "Pages", it.pages, 'placeholder="34–52"') : ""}
      ${t === "chapter" ? fld("editors", "Editors (as written: E. Editor & F. Editor)", it.editors) : ""}
      ${["book", "chapter", "report", "other"].includes(t) ? fld("publisher", "Publisher", it.publisher) : ""}
      ${t === "book" ? fld("edition", "Edition (2nd)", it.edition) : ""}
      ${t === "report" ? fld("reportNo", "Report number", it.reportNo) : ""}
      ${fld("doi", "DOI", it.doi, 'placeholder="10.1177/…"')}
      ${typeof ONLINE_LOOKUP !== "undefined" ? `<div class="f" style="align-self:end"><button class="btn" id="doiFill" type="button">Fill in from DOI</button></div>` : ""}
      ${fld("url", "URL (when there is no DOI)", it.url)}
    </div>
    ${it.refHtml ? `<label class="row" style="gap:8px"><input type="checkbox" id="e_useRaw" ${it.useRaw !== false ? "checked" : ""}> Use my exact wording for the reference entry</label><div class="refcard" style="font-size:14px" data-item="${it.id || ""}">${linkDOIs(it.refHtml)}</div>${sampleApi ? `<div class="row"><button class="btn" id="aiFill">Fill in fields from this wording</button><span class="note" id="aiNote">Claude reads the entry and fills the fields above. Check them before saving.</span></div>` : ""}` : ""}
    <div class="grid2">${fld("tags", "Tags, separated by commas", (it.tags || []).join(", "))}</div>
    <label class="f"><span>Notes</span><textarea id="e_notes" rows="3">${esc(it.notes || "")}</textarea></label>
    <div><h3 style="margin:0 0 6px">Preview</h3><div class="refcard" id="e_prev"></div></div>
    <div class="row"><button class="btn primary" id="e_save">Save</button><button class="btn" id="e_cancel">Cancel</button></div>
  </div>`;
}
function readEditor(base) {
  const v = id => { const el = $("#e_" + id); return el ? el.value.trim() : undefined; };
  const it = Object.assign({}, base || {});
  it.type = v("type");
  for (const k of ["year", "suffix", "date", "title", "container", "volume", "issue", "pages", "editors", "publisher", "edition", "reportNo", "legal", "doi", "url"]) { const x = v(k); if (x !== undefined) it[k] = x; }
  if ($("#e_authors")) it.authors = textToAuthors($("#e_authors").value); else it.authors = [];
  it.suffix = (it.suffix || "").toLowerCase().replace(/[^a-z]/g, "");
  it.tags = v("tags").split(",").map(s => s.trim()).filter(Boolean);
  it.notes = $("#e_notes").value;
  if ($("#e_useRaw")) it.useRaw = $("#e_useRaw").checked;
  return it;
}
function bindEditor(orig) {
  const prev = () => { const it = readEditor(orig); const t = items.filter(x => x.id !== it.id).concat([it]); assignSuffixes(t); $("#e_prev").innerHTML = formatReference(it); };
  $("#detail").oninput = prev; prev();
  $("#e_type").onchange = () => { const it = readEditor(orig); $("#detail").innerHTML = editorHtml(it); bindEditor(Object.assign({}, orig || {}, it)); };
  $("#e_cancel").onclick = () => { editing = false; renderDetail(); };
  $("#e_save").onclick = async () => {
    const it = readEditor(orig);
    if (!it.title && !(it.authors || []).length) { toast("Add at least a title or an author"); return; }
    if (it.year && !/^(19|20)\d\d$/.test(it.year)) { toast("Year should be four digits, like 2024"); return; }
    it.id = it.id || newId(); delete it._suffix; delete it.checkTitle;
    try { await saveItem(it); selectedId = it.id; editing = false; toast("Saved"); renderAll(); }
    catch (e) { toast(e.code === "quota_exceeded" ? "Your library is full." : "Couldn't save. Try again."); }
  };
  const sc = $("#scBtn");
  if (sc) sc.onclick = e => { e.preventDefault(); const el = $("#e_title"); el.value = sentenceCase(el.value); prev(); toast("Lowercased. Recapitalize any names, places or proper nouns."); };
  const df = $("#doiFill");
  if (df) df.onclick = async () => {
    const cur = readEditor(orig);
    const q = parseLookupInput(cur.doi || "");
    if (!q || q.kind !== "doi") { toast("Type the DOI in the DOI box first"); return; }
    df.disabled = true; df.textContent = "Looking up…";
    try {
      const got = await lookupDOI(q.value);
      const keepAbbr = (cur.authors || [])[0] && cur.authors[0].abbr;
      const merged = Object.assign({}, cur, got, { tags: cur.tags, notes: cur.notes, id: cur.id, refHtml: cur.refHtml, suffix: cur.suffix });
      if (keepAbbr && merged.authors[0] && merged.authors[0].org) merged.authors[0].abbr = keepAbbr;
      if (merged.refHtml) merged.useRaw = false;
      $("#detail").innerHTML = editorHtml(merged); bindEditor(Object.assign({}, orig || {}, { id: cur.id, refHtml: cur.refHtml }));
      toast("Filled in from Crossref. Check the title's capitalization, then save.");
    } catch (e) { toast(e.message); df.disabled = false; df.textContent = "Fill in from DOI"; }
  };
  const ai = $("#aiFill");
  if (ai) ai.onclick = async () => {
    ai.disabled = true; $("#aiNote").textContent = "Reading the entry…";
    try {
      const raw = htmlToText(orig.refHtml);
      const out = await sampleApi.json(`Parse this APA 7 reference into fields. Reply with only one JSON object with these keys (use "" when absent): type (one of article, book, chapter, report, webpage, legal, other), authors (array; a person is {"family":"...","given":"initials like M. K."}, a group author is {"org":"..."}), year (4 digits or ""), date (month and day or ""), title, container (journal, book title, or website), volume, issue, pages, editors, publisher, edition, reportNo, legal, doi (without https://doi.org/), url.\n\nReference:\n${raw}`, { modelTier: "quick" });
      if (out && typeof out === "object") {
        const merged = Object.assign({}, readEditor(orig));
        for (const k of ["type", "year", "date", "title", "container", "volume", "issue", "pages", "editors", "publisher", "edition", "reportNo", "legal", "doi", "url"]) if (out[k]) merged[k] = String(out[k]);
        if (Array.isArray(out.authors) && out.authors.length) {
          const oldAb = (orig.authors || [])[0]?.abbr;
          merged.authors = out.authors.map(a => a.org ? { org: String(a.org), ...(oldAb ? { abbr: oldAb } : {}) } : { family: String(a.family || ""), given: initials(String(a.given || "")) });
        }
        merged.useRaw = false;
        $("#detail").innerHTML = editorHtml(merged); bindEditor(Object.assign({}, orig, { refHtml: orig.refHtml }));
        toast("Fields filled. Check them, then save.");
      }
    } catch (e) {
      $("#aiNote").textContent = e.code === "not_granted" ? "Claude isn't available on this page." : "Couldn't read the entry. Fill the fields by hand.";
      ai.disabled = false;
    }
  };
}

// ---------- DOI links and right-click menu ----------
function linkDOIs(html) {
  return String(html || "").split(/(<[^>]+>)/).map(seg => seg.startsWith("<") ? seg :
    seg.replace(/https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^\s<]+?)(?=[.,;]?(?:\s|$))/g, (m, d) => `<a class="doi" href="https://doi.org/${d}" target="_blank" rel="noopener" data-doi="${d}">${m}</a>`)).join("");
}
let menuCtx = null;
function closeMenu() { const m = $("#doiMenu"); if (m) m.hidden = true; menuCtx = null; }
document.addEventListener("contextmenu", e => {
  const a = e.target.closest("a.doi");
  if (!a) return;
  e.preventDefault();
  const holder = a.closest("[data-item],[data-raw]");
  menuCtx = { doi: a.dataset.doi, itemId: holder && holder.dataset.item || null, raw: holder && holder.dataset.raw || null };
  const m = $("#doiMenu");
  m.querySelector("[data-act=check]").hidden = typeof ONLINE_LOOKUP === "undefined";
  m.querySelector("[data-act=fill]").hidden = typeof ONLINE_LOOKUP === "undefined" || !menuCtx.itemId || !items.find(x => x.id === menuCtx.itemId);
  m.hidden = false; menuOpenedAt = Date.now();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(e.clientX, innerWidth - w - 8)) + "px";
  m.style.top = Math.max(8, Math.min(e.clientY, innerHeight - h - 8)) + "px";
});
document.addEventListener("click", e => { if (!e.target.closest("#doiMenu")) closeMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeMenu(); $("#doiPanel").hidden = true; } });
let menuOpenedAt = 0;
window.addEventListener("scroll", () => { if (Date.now() - menuOpenedAt > 250) closeMenu(); }, true);
$("#doiMenu").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b || !menuCtx) return;
  const ctx = menuCtx; closeMenu();
  if (b.dataset.act === "open") { const a = document.createElement("a"); a.href = "https://doi.org/" + ctx.doi; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
  if (b.dataset.act === "copy") copyText(ctx.doi);
  if (b.dataset.act === "check") checkOneDOI(ctx);
  if (b.dataset.act === "fill") fillFromDOI(ctx);
});
function cmpNorm(s) { return norm(htmlToText(s || "")).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
async function checkOneDOI(ctx) {
  const panel = $("#doiPanel"), body = $("#doiPanelBody");
  panel.hidden = false; body.innerHTML = `<p class="note">Checking ${esc(ctx.doi)} with Crossref…</p>`;
  let got;
  try { got = await lookupDOI(ctx.doi); }
  catch (e) { body.innerHTML = `<p><span class="pill bad">Problem</span> ${esc(e.message)}</p><p class="note">DOI: ${esc(ctx.doi)}</p>`; return; }
  const it = ctx.itemId ? items.find(x => x.id === ctx.itemId) : null;
  const rawText = ctx.raw || (it ? htmlToText(formatReference(it)) : "");
  const mine = Object.assign(parseRefText(rawText), it && it.useRaw === false ? it : {});
  const vip = rawText.match(/,\s*(\d+)\s*(?:\(([^)]+)\))?,\s*([A-Za-z]?\d+(?:\s*[–-]\s*[A-Za-z]?\d+)?)/);
  if (vip) { mine.volume = mine.volume || vip[1]; mine.issue = mine.issue || vip[2] || ""; mine.pages = mine.pages || vip[3]; }
  const rows = [];
  const row = (label, a, b, same) => rows.push(`<tr><td>${label}</td><td>${esc(a || "—")}</td><td>${esc(b || "—")}</td><td>${same ? '<span class="pill ok">Match</span>' : '<span class="pill warn">Differs</span>'}</td></tr>`);
  const fa = (mine.authors || [])[0], fb = (got.authors || [])[0];
  const an = fa ? (fa.org || fa.family) : "", bn = fb ? (fb.org || fb.family) : "";
  row("First author", an, bn, cmpNorm(an) === cmpNorm(bn));
  row("Year", mine.year, got.year, (mine.year || "") === (got.year || ""));
  const ta = cmpNorm(mine.title), tb = cmpNorm(got.title);
  row("Title", mine.title, got.title, ta && tb && (ta === tb || ta.startsWith(tb) || tb.startsWith(ta)));
  if (got.container) row("Journal or book", (rawText.match(new RegExp(got.container.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) || [mine.container || "(not found in your entry)"])[0], got.container, new RegExp(got.container.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(rawText) || cmpNorm(mine.container) === cmpNorm(got.container));
  if (got.volume) row("Volume", mine.volume, got.volume, String(mine.volume || "") === String(got.volume));
  if (got.issue) row("Issue", mine.issue, got.issue, String(mine.issue || "") === String(got.issue));
  if (got.pages) row("Pages", mine.pages, got.pages, String(mine.pages || "").replace(/\s|-/g, "–").replace(/–+/g, "–") === got.pages.replace(/-/g, "–"));
  const wrong = !(cmpNorm(an) === cmpNorm(bn)) && !(ta && tb && (ta.slice(0, 25) === tb.slice(0, 25)));
  body.innerHTML = `<p>${wrong ? '<span class="pill bad">This DOI points to a different work</span>' : rows.some(r => r.includes("Differs")) ? '<span class="pill warn">Same work, some details differ</span>' : '<span class="pill ok">DOI and entry agree</span>'}</p>
    <div class="tbl-wrap"><table><thead><tr><th></th><th>Your entry</th><th>Crossref</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <p class="note">Crossref often capitalizes every word of a title, so a title can differ only in capitalization and still be the same work. Nothing in your library was changed.</p>
    ${ctx.itemId && items.find(x => x.id === ctx.itemId) ? `<div class="row"><button class="btn primary" id="panelFill">Fill in this reference from the DOI</button></div>` : ""}`;
  const pf = $("#panelFill"); if (pf) pf.onclick = () => { panel.hidden = true; fillFromDOI(ctx, got); };
}
async function fillFromDOI(ctx, got) {
  const it = items.find(x => x.id === ctx.itemId); if (!it) return;
  try { got = got || await lookupDOI(ctx.doi); } catch (e) { toast(e.message); return; }
  const cur = clone(it);
  const keepAbbr = (cur.authors || [])[0] && cur.authors[0].abbr;
  const merged = Object.assign({}, cur, got, { tags: cur.tags, notes: cur.notes, id: cur.id, refHtml: cur.refHtml, suffix: cur.suffix });
  if (keepAbbr && merged.authors[0] && merged.authors[0].org) merged.authors[0].abbr = keepAbbr;
  if (merged.refHtml) merged.useRaw = false;
  showTab("library"); selectedId = it.id; editing = true; draft = merged; renderList(); renderDetail();
  toast("Filled in from Crossref. Check the title's capitalization, then save.");
}
$("#doiPanelClose").addEventListener("click", () => $("#doiPanel").hidden = true);

// ---------- check a document ----------
const drop = $("#drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
function openDocs(fl) { const fs = Array.from(fl || []); if (fs.length > 1 && typeof runMulti === "function") runMulti(fs); else if (fs[0]) runCheck(fs[0]); }
drop.addEventListener("drop", e => openDocs(e.dataTransfer.files));
$("#docIn").addEventListener("change", e => { openDocs(e.target.files); e.target.value = ""; });

async function runCheck(file) {
  const out = $("#checkOut");
  if (!/\.docx$/i.test(file.name)) { out.innerHTML = `<p class="banner">That isn't a .docx file. Save the document from Word as .docx and try again.</p>`; return; }
  out.innerHTML = `<p class="note" style="margin-top:14px">Reading ${esc(file.name)}…</p>`;
  try {
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml").async("string");
    try { const sx = zip.file("word/styles.xml"); DOC_STYLES = sx && typeof loadStyles === "function" ? loadStyles(await sx.async("string")) : null; } catch (e) { DOC_STYLES = null; }
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    let result = checkDocument(dom, items.map(x => Object.assign({}, x)));
    let pulled = { added: 0, skipped: result.entries.length };
    if (result.hasRefHeading && result.entries.length) {
      out.innerHTML = `<p class="note" style="margin-top:14px">Pulling references from ${esc(file.name)} into your library…</p>`;
      const src = result.lib ? result.lib.notInLib.map(x => x.entry) : result.entries;
      const tag = file.name.replace(/\.docx$/i, "");
      const list = src.map(e => { const x = e.ref; const it = { type: x.type, authors: x.authors, year: x.year, suffix: x.suffix, date: x.date, title: x.title, refHtml: runHtml(e.p), useRaw: true, tags: [tag] }; for (const k of ["doi", "url", "legal"]) if (x[k]) it[k] = x[k]; return it; });
      const res = list.length ? await addMany(list) : { added: 0, skipped: 0 };
      pulled = { added: res.added, skipped: result.entries.length - res.added };
      if (!memMode) await new Promise(r => setTimeout(r, 600));
      result = checkDocument(new DOMParser().parseFromString(xml, "application/xml"), items.map(x => Object.assign({}, x)));
    }
    let style = null;
    try { const sdom = new DOMParser().parseFromString(xml, "application/xml"); style = styleCheck(sdom, checkDocument(sdom, [])); } catch (e) { style = null; }
    lastCheck = { name: file.name, xml, zip, result, pulled, fixes: {}, style, opts: { italics: true, doi: true, order: true, etal: true, amp: true } };
    renderCheck();
  } catch (e) {
    out.innerHTML = `<p class="banner">Couldn't read that file. Make sure it opens in Word and is saved as .docx.</p>`;
  }
}
function renderCheck() {
  const { result: r, name } = lastCheck;
  const out = $("#checkOut");
  if (!r.hasRefHeading) { out.innerHTML = `<p class="banner">${esc(name)} has no reference list heading (References, Reference List, Bibliography or Works Cited), so there was nothing to pull in. Add the heading in Word, save, and open the file again.</p>`; return; }
  const P = lastCheck.pulled || { added: 0, skipped: 0 };
  const misses = r.misses, unc = r.uncited, lib = r.lib;
  const stat = (n, label, cls) => `<div class="stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  let h = `<h3>${esc(name)}</h3><div class="allgood" style="margin-bottom:4px">${P.added ? `Pulled ${P.added} new reference${P.added === 1 ? "" : "s"} into your library` : "No new references to pull in"}${P.skipped ? `; ${P.skipped} ${P.skipped === 1 ? "was" : "were"} already there` : ""}. Your library now holds ${items.length}.</div><div class="stats">
    ${stat(r.entries.length, "references in the list", "")}
    ${stat(r.total, "citations matched", "ok")}
    ${stat(misses.length, "citations with no matching reference", misses.length ? "bad" : "ok")}
    ${stat(unc.length, "references never cited", unc.length ? "warn" : "ok")}
  </div>`;
  h += `<div class="row" style="margin-bottom:6px">${downloads ? `<button class="btn primary" id="saveLinked">Save a linked copy (.docx)</button>` : ""}
</div>
        ${downloads ? `<p class="note">The saved copy links each in-text citation to its reference entry (Ctrl+click in Word) and makes the corrections you've chosen below. Links stay black and unstyled. Your original file isn't changed.</p>` : `<p class="note">Saving files isn't available in this view.</p>`}`;
  if (!misses.length && !unc.length) h += `<div class="allgood">Every citation has a reference entry, and every reference is cited.</div>`;
  if (misses.length) {
    h += `<h3>Citations with no matching reference</h3><div class="tbl-wrap"><table><thead><tr><th>Citation</th><th>In the text</th><th>Is this the reference you meant?</th></tr></thead><tbody>
      ${misses.map((m, i) => `<tr><td class="mono">${esc(m.name)}, ${esc(m.years)}</td><td class="ctx">…${esc(m.context)}</td><td class="dym" data-miss="${i}"></td></tr>`).join("")}
    </tbody></table></div>`;
  }
  if (unc.length) h += `<h3>References never cited</h3><div class="bib" style="padding:16px 20px">${unc.map(e => { const near = misses.filter(m => m.candidates[0] === e); return `<p data-raw="${esc(paraText(e.p))}">${linkDOIs(runHtml(e.p))}</p>${near.length ? `<div class="note" style="margin:0 0 10px .5in">Possibly cited as ${near.map(m => esc(m.narrative ? `${m.name} (${m.years})` : `(${m.name}, ${m.years})`)).join(", ")}. See the table above.</div>` : ""}`; }).join("")}</div>`;
  if (r.dup.length) h += `<h3>Entries that can't be told apart</h3><p class="note">These references share the same author and year without a letter, so their citations look identical: ${r.dup.map(k => esc(k.replace("|", " "))).join("; ")}. Add a and b to the years.</p>`;
  const S = lastCheck.style;
  if (S) {
    const O = lastCheck.opts;
    const block = (key, title, items, render, fixable, rule) => {
      const n = typeof items === "number" ? items : items.length;
      if (!n) return "";
      return `<details class="sty"><summary><span class="pill ${fixable ? "warn" : "bad"}">${n}</span> ${title}${fixable ? `<label class="fixbox" onclick="event.stopPropagation()"><input type="checkbox" data-opt="${key}" ${O[key] ? "checked" : ""}> Fix in saved copy</label>` : `<span class="note"> · review by hand</span>`}</summary>${rule ? `<p class="note">${rule}</p>` : ""}${Array.isArray(items) ? `<ul class="stylist">${items.slice(0, 200).map(render).join("")}</ul>` : render()}</details>`;
    };
    const refName = e => esc(paraText(e.p).slice(0, 70)) + "…";
    let sh = "";
    const italG = []; for (const x of S.italics) { let g = italG.find(y => y.entry === x.entry); if (!g) { g = { entry: x.entry, parts: [] }; italG.push(g); } g.parts.push(x); }
    sh += block("italics", "Reference entries missing italics", italG, g => `<li>${g.parts.map(x => `<b>${esc(x.what)} not italic:</b> <i>${esc(x.part)}</i>`).join("<br>")}<br><span class="note">${refName(g.entry)}</span></li>`, true, "APA 7 italicizes the journal name and the volume number of an article (not the issue number or pages), and the title of a book, report, or web page. Each item names the part that isn't italic.");
    sh += block("doi", "DOIs not written as links", S.doi, x => `<li>${esc(x.from)} → ${esc(x.to)}</li>`, true, "APA 7 writes every DOI as https://doi.org/…");
    sh += block("order", "Reference list out of alphabetical order", S.order ? S.order.count : 0, () => `<ul class="stylist">${S.order.examples.map(e => `<li>${refName(e)} is out of place</li>`).join("")}</ul>`, true, "The fix sorts the whole list by author, then year.");
    sh += block("titleCase", "Titles that may not be in sentence case", S.titleCase, x => `<li>${esc(x.title)}</li>`, false, "APA 7 capitalizes only the first word, the first word after a colon, and proper nouns in article and book titles. Some of these may be proper nouns.");
    sh += block("etal", "Full author lists where APA 7 uses et al.", S.etal, x => `<li>${esc(x.from)} → ${esc(x.to)}<br><span class="note">…${esc(x.context)}…</span></li>`, true, "For three or more authors, APA 7 uses the first author and et al. from the first citation.");
    sh += block("amp", "“&” and “and” in the wrong place", S.amp, x => `<li>${esc(x.from)} → ${esc(x.to)} <span class="note">(${esc(x.rule)})</span><br><span class="note">…${esc(x.context)}…</span></li>`, true, "");
    sh += block("parenOrder", "Citations out of order inside parentheses", S.parenOrder, x => `<li>${esc(x.context)}</li>`, false, "APA 7 lists citations within one set of parentheses alphabetically, the way they appear in the reference list.");
    sh += block("firstUse", "Group author abbreviation used before it's spelled out", S.firstUse, x => `<li>${esc(x.abbr)} first appears as a citation before “${esc(x.org)} (${esc(x.abbr)})” is written out<br><span class="note">…${esc(x.context)}…</span></li>`, false, "");
    sh += block("quotes", "Quotations without a page number", S.quotes, x => `<li>“${esc(x.quote)}”<br><span class="note">…${esc(x.context)}…</span></li>`, false, "APA 7 requires a page or paragraph number for every direct quotation.");
    h += `<h3>APA style</h3>` + (sh || `<div class="allgood">No APA style problems found in the citations or the reference list.</div>`);
    const top = [...r.cited.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => { const e = r.entries.find(x => x.id === id); const lab = e.forms.find(f => /^[A-Z]{2,10}$/.test(f)) || e.forms.find(f => !/^(?:[A-Z]\.\s?)+/.test(f) && !/[\[(]/.test(f) && !/, /.test(f)) || e.forms[0] || ""; return `${esc(lab)} (${esc(e.year)}) — ${n}×`; });
    const once = [...r.cited.values()].filter(n => n === 1).length;
    h += `<h3>How often each source is cited</h3><p class="note" style="margin-top:0">Most cited: ${top.join(" · ")}. ${once} reference${once === 1 ? " is" : "s are"} cited only once. Counts appear beside each entry in the list below.</p>`;
  }
  h += `<details class="doclist"><summary>Reference list in this document (${r.entries.length})</summary><div class="bib" style="padding:16px 20px;margin-top:8px">${r.entries.map(e => { const hit = lib && lib.inLib.find(x => x.entry === e); return `<p data-raw="${esc(paraText(e.p))}"${hit ? ` data-item="${hit.itemId}"` : ""}>${linkDOIs(runHtml(e.p))} <span class="cnt">cited ${r.cited.get(e.id) || 0}×</span></p>`; }).join("")}</div></details>`;
  out.innerHTML = h;
  lastCheck.fixes = lastCheck.fixes || {};
  const preview = (m, e) => { const nm = e.forms.map(norm).includes(norm(m.name)) ? m.name : pickForm(e, m); return m.narrative ? `${nm} (${e.year})` : `(${nm}, ${e.year})`; };
  const drawCell = (td, mode) => {
    const i = +td.dataset.miss, m = misses[i], fx = lastCheck.fixes[i];
    if (fx) {
      const e = r.entries.find(x => x.id === fx);
      td.innerHTML = `<span class="pill ok">Will correct to ${esc(preview(m, e))}</span> <button class="copy" data-undo>Undo</button>`;
      td.querySelector("[data-undo]").onclick = () => { delete lastCheck.fixes[i]; drawCell(td); updSave(); };
      return;
    }
    const cand = m.candidates[0];
    if (cand && mode !== "pick") {
      td.innerHTML = `<div style="font-family:var(--serif);margin-bottom:6px">${linkDOIs(runHtml(cand.p))}</div><div class="row"><button class="btn primary" data-yes>Yes, correct it</button><button class="btn" data-no>No</button></div>`;
      td.querySelector("[data-yes]").onclick = () => { lastCheck.fixes[i] = cand.id; drawCell(td); updSave(); };
      td.querySelector("[data-no]").onclick = () => drawCell(td, "pick");
      return;
    }
    const others = m.candidates.slice(cand && mode === "pick" ? 1 : 0).concat(r.uncited.filter(e => !m.candidates.includes(e))).concat(r.entries.filter(e => !m.candidates.includes(e) && !r.uncited.includes(e)));
    td.innerHTML = `<div class="note" style="margin-bottom:6px">${cand ? "Choose the right reference, or leave the citation as it is." : "No close match. Choose a reference, or leave the citation as it is."}</div>
      <select data-sel style="max-width:420px"><option value="">Choose a reference…</option>${others.map(e => `<option value="${e.id}">${esc(paraText(e.p).slice(0, 110))}</option>`).join("")}</select>
      <div class="row" style="margin-top:6px"><button class="btn primary" data-use>Use this</button>${cand ? `<button class="btn" data-back>Back</button>` : ""}</div>`;
    td.querySelector("[data-use]").onclick = () => { const v = td.querySelector("[data-sel]").value; if (!v) { toast("Choose a reference first"); return; } lastCheck.fixes[i] = v; drawCell(td); updSave(); };
    const bk = td.querySelector("[data-back]"); if (bk) bk.onclick = () => drawCell(td);
  };
  const styleCount = () => { const S = lastCheck.style, O = lastCheck.opts; if (!S) return 0; return (O.italics ? new Set(S.italics.map(x => x.entry)).size : 0) + (O.doi ? S.doi.length : 0) + (O.order && S.order ? 1 : 0) + (O.etal ? S.etal.length : 0) + (O.amp ? S.amp.length : 0); };
  const updSave = () => { const n = Object.keys(lastCheck.fixes).length + styleCount(), b = $("#saveLinked"); if (b) b.textContent = n ? `Save a corrected, linked copy (${n} correction${n === 1 ? "" : "s"})` : "Save a linked copy (.docx)"; };
  $$("#checkOut [data-opt]").forEach(cb => cb.addEventListener("change", () => { lastCheck.opts[cb.dataset.opt] = cb.checked; updSave(); }));
  $$("#checkOut td.dym").forEach(td => drawCell(td));
  updSave();
  const sl = $("#saveLinked");
  if (sl) sl.onclick = async () => {
    sl.disabled = true;
    try {
      const dom = new DOMParser().parseFromString(lastCheck.xml, "application/xml");
      const fixes = Object.entries(lastCheck.fixes || {}).map(([k, v]) => ({ missIndex: +k, entryId: v }));
      const done = applyStyleFixes(dom, Object.assign({}, lastCheck.opts, { fixes }));
      const RB = lastCheck.opts.rebuild && typeof rebuildRefList === "function" ? rebuildRefList(dom) : null;
      const corrected = done.citations + done.etal + done.amp + done.italics + done.doi + (done.order ? 1 : 0) + (RB ? 1 : 0);
      const res = checkDocument(dom, []);
      const L = linkDocument(dom, res);
      const zip = await JSZip.loadAsync(await lastCheck.zip.generateAsync({ type: "arraybuffer" }));
      zip.file("word/document.xml", new XMLSerializer().serializeToString(dom));
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const fname = name.replace(/\.docx$/i, "") + (corrected ? " (corrected and linked).docx" : " (linked).docx");
      await downloads.save({ filename: fname, data: blob });
      if (RB) setTimeout(() => toast(`Reference list rebuilt: ${RB.entries} entries` + (RB.added ? `, ${RB.added} added from your library` : "") + (RB.removed ? `, ${RB.removed} uncited left out` : "")), 3200);
      toast(`Saved with ${L.linked} linked citations` + (corrected ? `; ${corrected} correction${corrected === 1 ? "" : "s"} made` : "") + (L.skipped ? `; ${L.skipped} couldn't be linked` : ""));
    } catch (e) { if (e.code !== "declined") toast(e.code === "unavailable" ? "Saving files isn't available here." : "Couldn't save the file."); }
    sl.disabled = false;
  };
  if (typeof afterRenderCheck === "function") afterRenderCheck(r);
  if (typeof afterRenderCheck2 === "function") afterRenderCheck2(r);
  if (typeof afterRenderCheck3 === "function") afterRenderCheck3(r);
}

// ---------- reference list ----------
function bibSources() {
  const S = [{ key: "all", label: `Whole library (${items.length})`, pick: () => items }];
  for (const t of allTags()) { const n = items.filter(i => (i.tags || []).includes(t)).length; S.push({ key: "tag:" + t, label: `Tag: ${t} (${n})`, pick: () => items.filter(i => (i.tags || []).includes(t)) }); }
  if (lastCheck && lastCheck.result.lib) {
    const ids = new Set(lastCheck.result.lib.inLib.map(x => x.itemId));
    S.push({ key: "doc", label: `Cited in ${lastCheck.name} (${ids.size} in library)`, pick: () => items.filter(i => ids.has(i.id)) });
  }
  return S;
}
function currentBib() {
  const S = bibSources(), sel = $("#bibSrc");
  const cur = sel.value || "all";
  sel.innerHTML = S.map(s => `<option value="${esc(s.key)}" ${s.key === cur ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  const src = (S.find(s => s.key === sel.value) || S[0]).pick().map(x => Object.assign({}, x));
  assignSuffixes(src);
  return src.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
function renderBib() {
  const list = currentBib();
  $("#bibOut").innerHTML = list.length ? `<h4>References</h4>` + list.map(it => `<p data-item="${it.id}">${linkDOIs(formatReference(it))}</p>`).join("") : `<div class="empty"><b>Nothing to list yet</b>Add references to your library, then come back to build the list.</div>`;
  $("#bibSave").hidden = !downloads;
}
$("#bibSrc").addEventListener("change", renderBib);
$("#bibCopy").addEventListener("click", () => {
  const list = currentBib(); if (!list.length) return;
  const html = list.map(it => `<p style="font-family:'Times New Roman';font-size:12pt;line-height:200%;margin:0 0 0 .5in;text-indent:-.5in">${formatReference(it)}</p>`).join("");
  copyText(list.map(it => htmlToText(formatReference(it))).join("\n"), html);
});
function runsXml(html) {
  const parts = html.split(/(<i>|<\/i>)/); let ital = false, out = "";
  const xmlEsc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const p of parts) {
    if (p === "<i>") { ital = true; continue; } if (p === "</i>") { ital = false; continue; }
    if (!p) continue;
    const text = xmlEsc(htmlToText(p));
    out += `<w:r>${ital ? "<w:rPr><w:i/></w:rPr>" : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  }
  return out;
}
$("#bibSave").addEventListener("click", async () => {
  const list = currentBib(); if (!list.length || !downloads) return;
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const paras = `<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>References</w:t></w:r></w:p>` +
    list.map(it => `<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto" w:after="0"/><w:ind w:left="720" w:hanging="720"/></w:pPr>${runsXml(formatReference(it))}</w:p>`).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${paras}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  try {
    const blob = await zip.generateAsync({ type: "blob" });
    await downloads.save({ filename: "References.docx", data: blob }); toast("Saved");
  } catch (e) { if (e.code !== "declined") toast("Couldn't save the file."); }
});

// ---------- import / export ----------
const pasteBox = $("#pasteBox");
function cleanPasted(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paras = []; let cur = "";
  const flush = () => { const t = cur.replace(/\s+/g, " ").replace(/<i>\s*<\/i>/g, "").trim(); if (htmlToText(t).trim()) paras.push(t); cur = ""; };
  const walk = (n, ital) => {
    if (n.nodeType === 3) { const t = esc(n.textContent); cur += ital ? `<i>${t}</i>` : t; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (["script", "style", "head", "meta", "title"].includes(tag)) return;
    const st = (n.getAttribute("style") || "").toLowerCase();
    const it = ital || tag === "i" || tag === "em" || /font-style:\s*italic/.test(st);
    const block = ["p", "div", "li", "h1", "h2", "h3", "h4", "tr", "blockquote"].includes(tag);
    if (tag === "br") { flush(); return; }
    if (block) flush();
    n.childNodes.forEach(c => walk(c, it && !/font-style:\s*normal/.test(st)));
    if (block) flush();
  };
  walk(doc.body, false); flush();
  return paras.map(p => p.replace(/<\/i><i>/g, ""));
}
pasteBox.addEventListener("paste", e => {
  e.preventDefault();
  const html = e.clipboardData.getData("text/html");
  const text = e.clipboardData.getData("text/plain");
  const paras = html ? cleanPasted(html) : text.split(/\r?\n/).map(s => esc(s.trim())).filter(Boolean);
  pasteBox.innerHTML = paras.map(p => `<p style="margin:0 0 6px">${p}</p>`).join("");
  $("#pasteNote").textContent = `${paras.length} reference${paras.length === 1 ? "" : "s"} ready`;
});
$("#pasteImport").addEventListener("click", async () => {
  let paras = Array.from(pasteBox.querySelectorAll("p")).map(p => p.innerHTML.replace(/<em>/g, "<i>").replace(/<\/em>/g, "</i>").replace(/<(?!\/?i>)[^>]+>/g, ""));
  if (!paras.length) paras = pasteBox.innerText.split(/\n+/).map(s => esc(s.trim())).filter(Boolean);
  paras = paras.filter(p => htmlToText(p).trim());
  if (!paras.length) { toast("Paste some references first"); return; }
  const list = paras.map(h => { const x = parseRefText(htmlToText(h)); const it = { type: x.type, authors: x.authors, year: x.year, suffix: x.suffix, date: x.date, title: x.title, refHtml: h, useRaw: true, tags: [] }; for (const k of ["doi", "url", "legal"]) if (x[k]) it[k] = x[k]; return it; });
  $("#pasteImport").disabled = true;
  const res = await addMany(list, $("#pasteNote"));
  $("#pasteImport").disabled = false;
  $("#pasteNote").textContent = `Added ${res.added}` + (res.skipped ? `, skipped ${res.skipped} already in your library` : "");
  if (res.added) pasteBox.innerHTML = "";
});
$("#rawFile").addEventListener("change", async e => { const f = e.target.files[0]; if (f) $("#rawBox").value = await f.text(); });
$("#rawImport").addEventListener("click", async () => {
  const txt = $("#rawBox").value.trim(), note = $("#rawNote");
  if (!txt) { note.textContent = "Paste something or choose a file first."; return; }
  let list = [];
  try {
    if (/^[\[{]/.test(txt)) { const j = JSON.parse(txt); list = (Array.isArray(j) ? j : j.items || []).map(x => { const { id, _suffix, ...r } = x; return r; }); }
    else if (/^TY {2}- /m.test(txt)) list = parseRIS(txt);
    else if (/@\w+\s*\{/.test(txt)) list = parseBibTeX(txt);
    else list = txt.split(/\n+/).map(s => s.trim()).filter(Boolean).map(s => { const x = parseRefText(s); return { ...x, refHtml: esc(s), useRaw: true, tags: [] }; });
  } catch { note.textContent = "That file couldn't be read. Check that it's RIS, BibTeX or a Citekeep backup."; return; }
  if (!list.length) { note.textContent = "No references were found in that text."; return; }
  list.forEach(x => { delete x.raw; });
  $("#rawImport").disabled = true;
  const res = await addMany(list, note);
  $("#rawImport").disabled = false;
  note.textContent = `Added ${res.added}` + (res.skipped ? `, skipped ${res.skipped} already in your library` : "");
});
$$("[data-exp]").forEach(b => { b.dataset.needs = "dl"; b.addEventListener("click", async () => {
  if (!downloads) { toast("Saving files isn't available here."); return; }
  const S = sorted().map(x => { const { _suffix, ...r } = x; return r; });
  const kind = b.dataset.exp;
  const data = kind === "json" ? JSON.stringify({ app: "Citekeep", exported: new Date().toISOString(), items: S }, null, 1) : kind === "ris" ? toRIS(S) : toBibTeX(S);
  const fname = "Citekeep library." + (kind === "json" ? "json" : kind === "ris" ? "txt" : "txt");
  try { await downloads.save({ filename: kind === "json" ? "Citekeep library.json" : kind === "ris" ? "Citekeep library.ris" : "Citekeep library.bib", data }); toast("Saved"); }
  catch (e) { if (e.code !== "declined") toast("Couldn't save the file."); }
}); });
const wipe = $("#wipe");
wipe.addEventListener("click", async () => {
  if (!items.length) { toast("Your library is already empty"); return; }
  if (!wipe.classList.contains("armed")) { wipe.classList.add("armed"); wipe.textContent = `Delete all ${items.length} references`; setTimeout(() => { wipe.classList.remove("armed"); wipe.textContent = "Delete entire library"; }, 5000); return; }
  wipe.disabled = true;
  for (const it of items.slice()) await deleteItem(it.id).catch(() => {});
  wipe.disabled = false; wipe.classList.remove("armed"); wipe.textContent = "Delete entire library"; selectedId = null; toast("Library deleted");
});

// ---------- start ----------
try { const t = localStorage.getItem("ck-tab"); if (t && t !== "library") showTab(t); } catch {}
renderAll();
initStore();
