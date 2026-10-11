// ===== V23: add references from PDFs, rebuild a document's reference list, search inside PDFs, merge duplicates, collections =====

// ---------- 1. add a reference by reading a PDF ----------
function doisInText(s) {
  const out = [], re = /\b(10\.\d{4,9}\/[^\s"<>{}]+)/g; let m;
  while ((m = re.exec(String(s || "")))) {
    let d = m[1].replace(/[.,;:\]]+$/, "");
    if ((d.match(/\)/g) || []).length > (d.match(/\(/g) || []).length) d = d.replace(/\)+$/, "");
    d = d.toLowerCase();
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
function titleInPdf(title, e) {
  const full = compactKey(title || ""), main = compactKey(String(title || "").split(/[:?.]\s/)[0]);
  if (!e || !e.c) return false;
  return (full.length >= 12 && e.c.includes(full)) || (main.length >= 15 && e.c.includes(main)) || (e.title && compactKey(e.title) === full && full.length >= 12);
}
// work out which publication a PDF is: its own DOI, a title search, or an ISBN, each confirmed against the PDF's first pages
async function identifyPdf(e) {
  const tried = new Set();
  const metaDois = doisInText(e.meta || ""), pageDois = doisInText(e.r1 || "");
  for (const d of metaDois.concat(pageDois).slice(0, 5)) {
    if (tried.has(d)) continue; tried.add(d);
    try { const it = await lookupDOI(d); if (titleInPdf(it.title, e) || (metaDois.includes(d) && it.title)) return { item: it, how: "DOI" }; } catch (x) {}
  }
  const q = (e.titleGuess || (e.title && e.title.length > 12 && !/^microsoft|\.docx?$|^untitled/i.test(e.title) ? e.title : "")).trim();
  if (q) {
    try {
      const r = await fetch("https://api.crossref.org/works?rows=5&query.bibliographic=" + encodeURIComponent(q.slice(0, 250)));
      if (r.ok) for (const m of ((await r.json()).message || {}).items || []) { const it = crossrefToItem(m); if (it.title && titleInPdf(it.title, e)) return { item: it, how: "title" }; }
    } catch (x) {}
  }
  const isbn = String(e.r1 || "").match(/ISBN(?:-1[03])?:?\s*((?:97[89][-\s]?)?\d[\d\s-]{8,15}[\dXx])/);
  if (isbn) { try { const it = await lookupISBN(isbn[1].replace(/[^0-9Xx]/g, "").toUpperCase()); if (titleInPdf(it.title, e)) return { item: it, how: "ISBN" }; } catch (x) {} }
  return { guess: q };
}
function prepNewItem(it) {
  const c = Object.assign({ tags: [] }, it);
  // APA 7 puts every title in sentence case; Crossref usually has Title Case
  if (c.title && c.type !== "legal") {
    const words = c.title.split(/\s+/).slice(1).map(w => w.replace(/^[“"‘'(]+|[”"’'),.;:?!]+$/g, "")).filter(w => w.length >= 4 && !/^[A-Z0-9][A-Z0-9&.\-–]+$/.test(w));
    if (words.length >= 2 && words.filter(w => /^[A-Z]/.test(w)).length / words.length >= 0.75) { c.title = sentenceCase(c.title); c.checkTitle = true; }
  }
  return c;
}
function existingFor(it) {
  const d = normDoi(it.doi);
  return items.find(x => (d && normDoi(x.doi) === d) || dedupKey(x) === dedupKey(it));
}
// returns { added | linked | known | none, item?, name? }
async function addFromPdfBytes(bytes, origName, srcInDownloads) {
  if (!PDF.folder) throw new Error("Choose your PDF folder in Settings first.");
  const e = await readOnePdf({ path: origName }, null, bytes);
  if (!e.c) return { none: true, reason: "no text" };
  // first, is it a reference already in the library (its DOI on the page, or its title and authors)?
  const f0 = { path: "new:" + origName, name: origName, key: " " + fileKey(origName) + " ", _info: e };
  const L = libDoiSet();
  const cands = items.map(it => [it, matchScore(it, f0, L)]).filter(([, m]) => m.how !== "name" && accepted(m)).sort((a, b) => b[1].s - a[1].s);
  if (cands.length && (cands[0][1].how === "doi" || !cands[1] || cands[0][1].s - cands[1][1].s >= 10)) {
    const ex0 = cands[0][0];
    if (ex0.file) return { known: true, item: ex0 };
    const place0 = srcInDownloads ? { folder: GET.dl, name: origName } : null;
    const nm = await window.citekeepApp.placePdf(PDF.folder, pdfNameFor(ex0), place0, place0 ? null : bytes);
    await adoptFiled(ex0, nm); return { linked: true, item: ex0, name: nm, how: "library" };
  }
  const id = await identifyPdf(e);
  if (!id.item) return { none: true, guess: id.guess };
  const ex = existingFor(id.item);
  if (ex && ex.file) return { known: true, item: ex };
  const target = ex || prepNewItem(id.item);
  const place = srcInDownloads ? { folder: GET.dl, name: origName } : null;
  const name = await window.citekeepApp.placePdf(PDF.folder, pdfNameFor(target), place, place ? null : bytes);
  if (ex) { await adoptFiled(ex, name); return { linked: true, item: ex, name, how: id.how }; }
  const fresh = Object.assign({}, target, { id: newId(), created: Date.now() });
  const sid = await saveItem(fresh);
  const saved = items.find(x => x.id === sid) || fresh;
  await adoptFiled(saved, name);
  return { added: true, item: saved, name, how: id.how };
}
async function addFromPdfFiles(files) {
  if (!PDF || !PDF.folder) { toast("Choose your PDF folder in Settings first."); showTab("settings"); return; }
  const res = []; let i = 0;
  for (const f of files) {
    $("#count").textContent = `Reading ${++i} of ${files.length}: ${f.name}…`;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const r = await addFromPdfBytes(bytes, f.name, false);
      if (r.none) { const nm = await window.citekeepApp.placePdf(PDF.folder, f.name, null, bytes); r.name = nm; }
      res.push(Object.assign({ file: f.name }, r));
    } catch (x) { res.push({ file: f.name, error: x.message }); }
  }
  const add = res.filter(r => r.added), link = res.filter(r => r.linked), known = res.filter(r => r.known), none = res.filter(r => r.none || r.error);
  if (add.length === 1 && files.length === 1) { selectedId = add[0].item.id; editing = false; }
  renderAll();
  toast([add.length && `Added ${add.length} new reference${add.length === 1 ? "" : "s"}`, link.length && `linked ${link.length} to references you had`, known.length && `${known.length} already in your library`, none.length && `${none.length} couldn't be identified`].filter(Boolean).join("; ") || "Nothing added");
  if (none.length) setTimeout(() => toast(`${none.map(r => r.file).join(", ")}: saved to your PDF folder. Add the reference with New or Look up, then use Find my copy.`), 3500);
}

// ---------- 2. rebuild a document's reference list ----------
function libFormIndex() {
  const lib = items.map(x => Object.assign({}, x)); assignSuffixes(lib);
  return { lib, LF: buildFormIndex(lib.map(it => ({ id: it.id, year: it.year ? it.year + (it._suffix || "") : "n.d.", forms: itemForms(it) }))) };
}
// what a rebuilt list would contain: cited entries from the document, plus library entries for citations the list lacks
function planRebuild(r) {
  const { lib, LF } = libFormIndex();
  const keep = r.entries.filter(e => (r.cited.get(e.id) || 0) > 0);
  const drop = r.entries.filter(e => !(r.cited.get(e.id) || 0));
  const add = new Map(), missing = [];
  for (const m of r.misses || []) {
    let hit = null;
    for (const y of String(m.years || "").split(/,\s*/)) { const s = findCitations(`(${m.name}, ${y.trim()})`, LF).spans[0]; if (s) { hit = lib.find(x => x.id === s[2]); break; } }
    if (hit) { if (!keep.some(e => r.lib && r.lib.inLib.some(x => x.entry === e && x.itemId === hit.id))) add.set(hit.id, hit); }
    else missing.push(`${m.name} (${m.years})`);
  }
  return { keep, drop, add: [...add.values()], missing: [...new Set(missing)] };
}
function rebuildRefList(dom) {
  const r = checkDocument(dom, items.map(x => Object.assign({}, x)));
  if (!r.hasRefHeading || !r.entries.length) return null;
  const plan = planRebuild(r);
  const rd = readDocument(dom);
  const first = rd.refParas[0];
  const W = WNS;
  const pPr = first.getElementsByTagNameNS(W, "pPr")[0];
  const r0 = [...first.getElementsByTagNameNS(W, "r")].find(x => x.getElementsByTagNameNS(W, "t").length);
  const baseR = r0 && r0.getElementsByTagNameNS(W, "rPr")[0];
  const ser = new XMLSerializer();
  let rprXml = baseR ? ser.serializeToString(baseR) : "";
  rprXml = rprXml.replace(/<w:(i|iCs|b|bCs|u|color|rStyle|vertAlign|highlight)\b[^>]*\/>/g, "").replace(/<w:(i|iCs|b|bCs|u|color|rStyle|vertAlign|highlight)\b[^>]*>.*?<\/w:\1>/g, "");
  // keep only plain w: formatting; other prefixes (w14 and the like) would need their own declarations
  const onlyW = x => x.replace(/\s+xmlns(:\w+)?="[^"]*"/g, "").replace(/<(?!\/?w:)[^>]+>/g, "");
  rprXml = onlyW(rprXml);
  const inner = rprXml.replace(/^<w:rPr[^>]*>|<\/w:rPr>$|^<w:rPr[^>]*\/>$/g, "");
  const toRuns = html => html.split(/(<i>|<\/i>)/).reduce((acc, part) => {
    if (part === "<i>") { acc.ital = true; return acc; } if (part === "</i>") { acc.ital = false; return acc; } if (!part) return acc;
    const text = htmlToText(part).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    acc.xml += `<w:r><w:rPr>${inner}${acc.ital ? "<w:i/><w:iCs/>" : ""}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`; return acc;
  }, { xml: "", ital: false }).xml;
  const entryItem = e => { const h = r.lib && r.lib.inLib.find(x => x.entry === e); return h ? items.find(i => i.id === h.itemId) : null; };
  const rows = plan.keep.map(e => { const it = entryItem(e); const ref = Object.assign({}, e.ref, { _suffix: e.ref.suffix || "" }); return { html: apaWording(runHtml(e.p)), key: it && it.sortOverride ? it.sortOverride : sortKey(ref) }; })
    .concat(plan.add.map(it => ({ html: formatReference(it), key: orderKey(it) })));
  rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const pPrXml = pPr ? onlyW(ser.serializeToString(pPr)).replace(/<w:rPr>.*?<\/w:rPr>|<w:rPr\/>/g, "").replace(/<w:numPr>.*?<\/w:numPr>/g, "") : "";
  const parent = first.parentNode;
  const NSDECL = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  for (const row of rows) {
    let frag = new DOMParser().parseFromString(`<w:p ${NSDECL}>${pPrXml}${toRuns(row.html)}</w:p>`, "application/xml").documentElement;
    if (!frag || frag.localName !== "p" || frag.getElementsByTagName("parsererror").length) frag = new DOMParser().parseFromString(`<w:p ${NSDECL}>${pPrXml}${toRuns(row.html).replace(/<w:rPr>.*?<\/w:rPr>/g, m => /<w:i\/>/.test(m) ? "<w:rPr><w:i/></w:rPr>" : "")}</w:p>`, "application/xml").documentElement;
    parent.insertBefore(dom.importNode(frag, true), first);
  }
  for (const p of rd.refParas) p.parentNode.removeChild(p);
  return { entries: rows.length, removed: plan.drop.length, added: plan.add.length, missing: plan.missing.length };
}
function afterRenderCheck2(r) {
  const out = $("#checkOut"); if (!out || !r || !r.hasRefHeading || !r.entries.length || !downloads) return;
  const P = planRebuild(r);
  const sec = document.createElement("div");
  sec.innerHTML = `<h3>Rebuild the reference list</h3>
    <p class="note" style="margin-top:0">When you save the copy, Citekeep can replace the reference list with a fresh one: every source the text cites, in alphabetical order, with APA 7 italics and DOIs, and nothing the text doesn't cite. Entries keep your wording.</p>
    <ul class="stylist"><li>${P.keep.length} cited entr${P.keep.length === 1 ? "y" : "ies"} kept</li>${P.drop.length ? `<li>${P.drop.length} uncited entr${P.drop.length === 1 ? "y" : "ies"} left out: ${P.drop.slice(0, 6).map(e => esc(htmlToText(runHtml(e.p)).slice(0, 50))).join("; ")}${P.drop.length > 6 ? "…" : ""}</li>` : ""}${P.add.length ? `<li>${P.add.length} added from your library for citations the list was missing: ${P.add.map(it => esc(citeForms(it).narrative)).join("; ")}</li>` : ""}${P.missing.length ? `<li>${P.missing.length} cited but in neither the list nor your library, so they can't be added: ${P.missing.map(esc).join("; ")}</li>` : ""}</ul>
    <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="optRebuild" ${lastCheck.opts.rebuild ? "checked" : ""}>Rebuild the reference list in the saved copy</label>`;
  const anchor = out.querySelector("details.doclist");
  anchor ? out.insertBefore(sec, anchor) : out.appendChild(sec);
  $("#optRebuild").onchange = e => { lastCheck.opts.rebuild = e.target.checked; };
}

// ---------- 3. search inside your PDFs ----------
var FT = { data: null, building: false, on: false };
async function ftLoad() {
  if (FT.data) return FT.data;
  try { FT.data = JSON.parse((await window.citekeepApp.readText("pdf-text.json")) || "{}"); } catch (e) { FT.data = {}; }
  FT.data.files = FT.data.files || {};
  return FT.data;
}
async function ftBuild(onProgress) {
  if (FT.building || !PDF.folder || !canReadPdfs()) return;
  FT.building = true;
  try {
    const D = await ftLoad(); const keep = {}; const todo = [];
    for (const f of PDF.files) {
      const st = await window.citekeepApp.pdfStats(PDF.folder, f.path); const old = D.files[f.path];
      if (old && st && old.size === st.size && old.mtime === st.mtime) keep[f.path] = old; else todo.push([f, st]);
    }
    D.files = keep; let n = 0;
    for (const [f, st] of todo) {
      if (onProgress) onProgress(++n, todo.length);
      let pages = [];
      try { const full = await readPdfFull(f.path); pages = full.split(/=== PDF page \d+ ===\n?/).slice(1).map(p => p.replace(/\s+/g, " ").trim()); } catch (e) {}
      D.files[f.path] = { size: st ? st.size : 0, mtime: st ? st.mtime : 0, pages };
      if (n % 15 === 0) { try { await window.citekeepApp.writeText("pdf-text.json", JSON.stringify(D)); } catch (e) {} }
    }
    if (todo.length) { try { await window.citekeepApp.writeText("pdf-text.json", JSON.stringify(D)); } catch (e) {} }
  } finally { FT.building = false; }
}
function ftTerms(q) { const ph = [], rest = String(q || "").replace(/"([^"]+)"/g, (m, x) => { ph.push(x); return " "; }); return ph.concat(rest.split(/\s+/).filter(w => w.length > 1)).map(t => fold(t).toLowerCase()); }
// hits for one file: pages where every term appears, with a snippet around the first term
function ftHits(path, q) {
  const D = FT.data; const rec = D && D.files[path]; if (!rec || !rec.pages) return [];
  const terms = ftTerms(q); if (!terms.length) return [];
  const out = [];
  rec.pages.forEach((txt, i) => {
    const low = fold(txt).toLowerCase();
    if (!terms.every(t => low.includes(t))) return;
    const at = low.indexOf(terms[0]);
    const s = Math.max(0, at - 90), e = Math.min(txt.length, at + terms[0].length + 120);
    out.push({ page: i + 1, snippet: (s ? "…" : "") + txt.slice(s, e) + (e < txt.length ? "…" : ""), n: low.split(terms[0]).length - 1 });
  });
  return out;
}
function ftMatchItem(it) { return FT.on && filter.q && it.file && !String(it.file).startsWith("drive:") && ftHits(it.file, filter.q).length > 0; }
function ftDetail(it) {
  const tn = it.checkTitle ? `<div class="banner" style="margin:0">Citekeep added this from a PDF and put the title in sentence case for APA. Capitalize any names or places it lowercased (Edit), then <button class="copy" data-titleok="1">mark it checked</button>.</div>` : "";
  return tn + ftDetailHits(it);
}
function ftDetailHits(it) {
  if (!FT.on || !filter.q || !it.file) return "";
  const hits = ftHits(it.file, filter.q); if (!hits.length) return "";
  const terms = ftTerms(filter.q);
  const mark = s => { let h = esc(s); for (const t of terms) { const re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"); h = h.replace(re, "<mark>$1</mark>"); } return h; };
  return `<div class="mxbox"><h3 style="margin:0 0 6px">Found in the PDF</h3><ul class="stylist">${hits.slice(0, 10).map(h => `<li><button class="copy" data-ftpage="${h.page}">PDF page ${h.page}</button> ${mark(h.snippet)}</li>`).join("")}</ul>${hits.length > 10 ? `<p class="note">and ${hits.length - 10} more pages</p>` : ""}</div>`;
}
async function ftToggle(on) {
  FT.on = on;
  if (on) {
    if (!PDF.folder) { toast("Choose your PDF folder first"); FT.on = false; $("#ftOn").checked = false; return; }
    await ftLoad();
    await ftBuild((d, t) => { $("#count").textContent = `Reading your PDFs for searching: ${d} of ${t}…`; });
  }
  renderList(); renderDetail();
}

// ---------- 4. duplicates ----------
function titleKey(t) { return compactKey(String(t || "")).slice(0, 80); }
function findDuplicates() {
  const pairs = [], seen = new Set();
  const add = (a, b, why) => { const k = [a.id, b.id].sort().join("|"); if (seen.has(k)) return; seen.add(k); pairs.push({ a, b, why }); };
  const byDoi = new Map(), byTitle = new Map();
  for (const it of items) {
    const d = normDoi(it.doi); if (d) { if (byDoi.has(d)) add(byDoi.get(d), it, "same DOI"); else byDoi.set(d, it); }
    const t = titleKey(it.title || htmlToText(it.refHtml || "")); if (t.length >= 15) { const k = t + "|" + (it.year || ""); if (byTitle.has(k)) add(byTitle.get(k), it, "same title and year"); else byTitle.set(k, it); }
  }
  // near misses: same first author and year, one title contains the other
  const groups = new Map();
  for (const it of items) { const a = (it.authors || [])[0]; if (!a || !it.year) continue; const k = fold(a.family || a.org || "").toLowerCase() + "|" + it.year; (groups.get(k) || groups.set(k, []).get(k)).push(it); }
  for (const g of groups.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const x = titleKey(g[i].title), y = titleKey(g[j].title); if (x.length < 15 || y.length < 15 || x === y) continue;
    if ((g[i].suffix && g[j].suffix && g[i].suffix !== g[j].suffix)) continue;
    if (x.includes(y.slice(0, 30)) || y.includes(x.slice(0, 30))) add(g[i], g[j], "same author, year and title start");
  }
  return pairs;
}
function mergeInto(keep, other) {
  const m = Object.assign({}, keep);
  for (const k of ["doi", "url", "file", "fileName", "fileLink", "container", "volume", "issue", "pages", "publisher", "date", "notices", "noticesChecked"]) if (!m[k] && other[k]) m[k] = other[k];
  if (!mxHas(keep) && other.mx && mxHas(other)) m.mx = other.mx;
  m.tags = [...new Set((keep.tags || []).concat(other.tags || []))];
  if (other.notes && other.notes !== keep.notes) m.notes = [keep.notes, other.notes].filter(Boolean).join("\n\n");
  return m;
}
function renderDupes() {
  const pairs = findDuplicates();
  selectedId = null; editing = false; renderList();
  const d = $("#detail");
  d.innerHTML = `<div class="detail"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Possible duplicates</h3><button class="btn" id="dupClose">Close</button></div>
    ${pairs.length ? `<p class="note" style="margin:0">Pick the entry to keep. Its wording is kept; tags, notes, the PDF link, the DOI and matrix row are filled in from the other entry where it has them, and the other entry is deleted.</p>
    ${pairs.map((p, i) => `<div class="mxbox" data-pair="${i}"><div class="note">${esc(p.why)}</div>
      ${[p.a, p.b].map((it, k) => `<label style="display:flex;gap:8px;align-items:flex-start;margin-top:6px"><input type="radio" name="keep${i}" value="${k}" ${k === 0 ? "checked" : ""}><span class="refcard" style="margin:0;flex:1">${formatReference(it)}${it.file ? ` <span class="chip">PDF</span>` : ""}${mxHas(it) ? ` <span class="chip">matrix</span>` : ""}</span></label>`).join("")}
      <div class="row" style="margin-top:6px"><button class="btn primary" data-merge="${i}">Merge</button><button class="copy" data-notdup="${i}">Not duplicates</button></div></div>`).join("")}` : `<div class="allgood">No duplicates found.</div>`}</div>`;
  $("#dupClose").onclick = () => renderDetail();
  d.querySelectorAll("[data-merge]").forEach(b => b.onclick = async () => {
    const i = +b.dataset.merge, p = pairs[i]; const k = +d.querySelector(`input[name=keep${i}]:checked`).value;
    const keep = items.find(x => x.id === (k ? p.b : p.a).id), other = items.find(x => x.id === (k ? p.a : p.b).id);
    if (!keep || !other) return;
    await saveItem(mergeInto(keep, other)); await deleteItem(other.id);
    toast("Merged"); renderDupes();
  });
  d.querySelectorAll("[data-notdup]").forEach(b => b.onclick = () => { b.closest(".mxbox").remove(); });
}

// ---------- 5. collections: tags with folders (Dissertation/Chapter 2) and tagging what's shown ----------
function tagTree() {
  const all = new Set();
  for (const t of allTags()) { const parts = t.split("/"); for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/")); }
  return [...all].sort((a, b) => a.localeCompare(b));
}
async function tagShown(add) {
  const shown = sorted().filter(matches);
  if (!shown.length) return;
  const tag = (prompt(add ? `Add a tag to the ${shown.length} references shown. Use / for folders, like Dissertation/Chapter 2.` : `Remove which tag from the ${shown.length} references shown?`) || "").trim().replace(/\s*\/\s*/g, "/");
  if (!tag) return;
  let n = 0;
  for (const it of shown) {
    const has = (it.tags || []).includes(tag);
    if (add && !has) { await saveItem(Object.assign({}, it, { tags: (it.tags || []).concat(tag) })); n++; }
    if (!add && has) { await saveItem(Object.assign({}, it, { tags: it.tags.filter(t => t !== tag) })); n++; }
  }
  toast(`${add ? "Tagged" : "Untagged"} ${n} reference${n === 1 ? "" : "s"}`); renderAll();
}

// ---------- wiring ----------
(function () {
  const go = () => {
    const hdr = $("#tab-library .pane-h"); if (!hdr) return;
    hdr.insertAdjacentHTML("beforeend", `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
      <label class="note" style="display:flex;gap:6px;align-items:center" title="Search the text of your PDFs as well"><input type="checkbox" id="ftOn">Search inside PDFs</label>
      <span class="row" style="gap:4px"><label class="copy" for="addPdfIn" style="cursor:pointer">Add from PDF</label><input type="file" id="addPdfIn" accept=".pdf" multiple hidden><button class="copy" id="dupBtn">Duplicates</button><button class="copy" id="tagAdd" title="Add a tag to every reference shown">Tag shown</button><button class="copy" id="tagDel" title="Remove a tag from every reference shown">Untag</button></span></div>`);
    $("#ftOn").onchange = e => ftToggle(e.target.checked);
    $("#addPdfIn").onchange = e => { const fs = Array.from(e.target.files || []); if (fs.length) addFromPdfFiles(fs); e.target.value = ""; };
    $("#dupBtn").onclick = renderDupes;
    $("#tagAdd").onclick = () => tagShown(true);
    $("#tagDel").onclick = () => tagShown(false);
    $("#detail").addEventListener("click", async e => {
      const ok = e.target.closest("[data-titleok]");
      if (ok) { const it = items.find(x => x.id === selectedId); if (it) { const c = Object.assign({}, it); delete c.checkTitle; await saveItem(c); renderDetail(); } return; }
      const b = e.target.closest("[data-ftpage]"); if (!b) return;
      const it = items.find(x => x.id === selectedId); if (!it || !it.file) return;
      const err = await window.citekeepApp.openPdf(PDF.folder, it.file, +b.dataset.ftpage);
      if (err) toast("Couldn't open the PDF.");
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
