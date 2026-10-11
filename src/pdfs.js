// ===== Your PDFs (desktop): a remembered folder on this computer, plus Google Drive =====
var PDF = { folder: "", files: [], drive: [], name: "", signedIn: false, settings: {} };
var canPickFolder = true;
var STOP = new Set("the and for with from into that this what when does about their study effects effect impact analysis review using among between toward towards report annual".split(" "));
function fileKey(name) {
  return fold(name.replace(/\.pdf$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function allFiles() { return PDF.files.concat(PDF.drive); }
// ---- looking inside PDFs: the DOI printed on the first page or stored in the file, and the title and authors on the first pages
var PDFIDX = null, PDFREAD = { busy: false, done: 0, total: 0 };
function canReadPdfs() { return !!(window.pdfjsLib && window.citekeepApp && window.citekeepApp.readPdf); }
function normDoi(d) { return String(d || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").replace(/[.,;\]]+$/, "").toLowerCase(); }
function spacedKey(t) { return fold(String(t || "").normalize("NFKC").replace(/[-­‐]\s*\n\s*/g, "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function compactKey(t) { return spacedKey(t).replace(/ /g, ""); }
async function loadPdfIndex() {
  if (PDFIDX) return PDFIDX;
  try { PDFIDX = JSON.parse((await window.citekeepApp.loadPdfIndex()) || "{}") || {}; } catch (e) { PDFIDX = {}; }
  const last = p => String(p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop().toLowerCase();
  if (PDFIDX.folder !== PDF.folder) { if (last(PDFIDX.folder) === last(PDF.folder) && PDFIDX.files) PDFIDX.folder = PDF.folder; else PDFIDX = { folder: PDF.folder, files: {} }; } // same folder moved to another computer keeps what was read
  PDFIDX.files = PDFIDX.files || {};
  return PDFIDX;
}
async function readOnePdf(f, folder, bufIn) {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js";
  const buf = bufIn || await window.citekeepApp.readPdf(folder || PDF.folder, f.path);
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 });
  const doc = await task.promise;
  const out = { meta: "", title: "", c1: "", t: "", c: "", pages: doc.numPages };
  try {
    const m = await doc.getMetadata(); const i = (m && m.info) || {};
    out.title = String(i.Title || "").trim();
    let raw = [i.Title, i.Subject, i.Keywords].filter(Boolean).join(" ");
    try { if (m.metadata && m.metadata.getAll) raw += " " + JSON.stringify(m.metadata.getAll()); } catch (e) {}
    out.meta = raw.toLowerCase().replace(/\s+/g, "").slice(0, 4000);
  } catch (e) {}
  const pages = [];
  for (let n = 1; n <= Math.min(2, doc.numPages); n++) {
    const pg = await doc.getPage(n);
    const tc = await pg.getTextContent();
    pages.push(tc.items.map(x => (x.str || "") + (x.hasEOL ? "\n" : " ")).join(""));
    if (n === 1) {
      // the largest type on the first page is usually the title
      const its = tc.items.filter(x => x.str && x.str.trim().length > 1);
      const size = x => Math.round(Math.abs(x.transform[3]) * 10) / 10;
      const big = its.filter(x => x.str.trim().length > 2).map(size).sort((a, b) => b - a);
      let guess = "";
      const allLen = its.reduce((n, x) => n + x.str.length, 0);
      for (const sz of [...new Set(big)].slice(0, 3)) {
        if (its.filter(x => size(x) === sz).reduce((n, x) => n + x.str.length, 0) > allLen * 0.5) break; // one size for everything: no title to pick out
        const run = its.filter(x => size(x) === sz).map(x => x.str.trim()).join(" ").replace(/\s+/g, " ").trim();
        if (run.length >= 12 && run.length <= 300 && /[a-z]/i.test(run) && !/^(journal|vol|volume|issn|doi|downloaded|copyright|original (research|article)|research article|article)\b/i.test(run)) { guess = run; break; }
      }
      out.titleGuess = guess;
    }
    pg.cleanup();
  }
  await doc.destroy();
  out.r1 = (pages[0] || "").slice(0, 4000);
  out.c1 = (pages[0] || "").toLowerCase().replace(/\s+/g, "").slice(0, 12000);
  const both = pages.join("\n");
  out.t = spacedKey(both).slice(0, 8000);
  out.c = compactKey(both).slice(0, 10000);
  return out;
}
// the whole article as text, page by page, with blank lines between paragraphs (for AI drafting)
async function readPdfFull(rel) {
  if (!canReadPdfs() || !PDF.folder) throw new Error("Connect your PDF folder first.");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js";
  let buf;
  try { buf = await window.citekeepApp.readPdf(PDF.folder, rel); } catch (e) { throw new Error(`Couldn't open “${rel}”. It may have been moved or renamed.`); }
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const tc = await pg.getTextContent();
    // rebuild lines from positions, then start a new paragraph at a larger vertical gap or an indented first line
    const lines = []; let cur = null;
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      if (!it.str) { if (cur && it.hasEOL) cur.eol = true; continue; }
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 10;
      if (!cur || Math.abs(y - cur.y) > h * 0.5) { cur = { y, x, h, text: "" }; lines.push(cur); }
      cur.text += it.str; if (it.hasEOL) cur.eol = true;
      if (x < cur.x) cur.x = x;
    }
    const xs = lines.filter(l => l.text.trim().length > 25).map(l => Math.round(l.x)).sort((a, b) => a - b);
    const left = xs.length ? xs[Math.floor(xs.length * 0.2)] : 0;
    const lens = lines.map(l => l.text.trim().length).filter(n => n > 0).sort((a, b) => a - b);
    const typical = lens.length ? lens[Math.floor(lens.length * 0.75)] : 80;
    let txt = "", prev = null;
    for (const l of lines) {
      const t = l.text.replace(/\s+/g, " ").trim(); if (!t) continue;
      let brk = false;
      if (prev) {
        const gap = prev.y - l.y;
        if (gap > prev.h * 1.75 || gap < -prev.h) brk = true; // a blank line, or a jump to a new column
        else if (l.x - left > l.h * 1.2 && l.x - left < l.h * 6) brk = true; // an indented first line
        else if (/[.?!:]["”’)]?$/.test(prev.text.trim()) && prev.text.trim().length < typical * 0.6) brk = true; // a short last line
      }
      txt += prev ? (brk ? "\n\n" : (/-$/.test(txt) && /^[a-z]/.test(t) ? "" : " ")) : "";
      if (prev && !brk && /-$/.test(txt.slice(-1)) && /^[a-z]/.test(t)) txt = txt.slice(0, -1);
      txt += t; prev = l;
    }
    out.push(`=== PDF page ${n} ===\n${txt}`);
    pg.cleanup();
  }
  await doc.destroy();
  return out.join("\n\n");
}
async function indexPdfs(onProgress) {
  if (!canReadPdfs() || !PDF.folder || PDFREAD.busy) return;
  PDFREAD.busy = true;
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js";
    const idx = await loadPdfIndex();
    const keep = {}; const todo = [];
    for (const f of PDF.files) {
      const st = await window.citekeepApp.pdfStats(PDF.folder, f.path);
      const old = idx.files[f.path];
      if (old && st && old.size === st.size && old.mtime === st.mtime) keep[f.path] = old;
      else todo.push([f, st]);
    }
    idx.files = keep;
    PDFREAD.total = todo.length; PDFREAD.done = 0;
    for (const [f, st] of todo) {
      let e = { size: st ? st.size : 0, mtime: st ? st.mtime : 0 };
      if (!st || st.size < 120 * 1024 * 1024) {
        try { Object.assign(e, await readOnePdf(f)); } catch (err) { e.error = true; }
      } else e.error = true;
      idx.files[f.path] = e;
      PDFREAD.done++;
      if (onProgress) onProgress(PDFREAD.done, PDFREAD.total);
      if (PDFREAD.done % 20 === 0) { try { await window.citekeepApp.savePdfIndex(JSON.stringify(idx)); } catch (x) {} }
    }
    if (todo.length || Object.keys(keep).length !== PDF.files.length) { try { await window.citekeepApp.savePdfIndex(JSON.stringify(idx)); } catch (x) {} }
  } finally { PDFREAD.busy = false; }
}
function pdfInfo(f) { if (f._info) return f._info; return PDFIDX && PDFIDX.files && !String(f.path).startsWith("drive:") ? PDFIDX.files[f.path] : null; }
// the DOI a PDF belongs to: one stored in the file wins, otherwise the library DOI printed earliest on its first page
var OWNDOI = new WeakMap();
function ownDoi(f, libDois) {
  const e = pdfInfo(f); if (!e || e.error) return "";
  const c = OWNDOI.get(e); if (c && c.lib === libDois) return c.doi;
  let best = "", bestPos = Infinity;
  for (const d of libDois) {
    if (e.meta && e.meta.includes(d)) { if (bestPos > -1 || d.length > best.length) { best = d; bestPos = -1; } continue; }
    const at = e.c1 ? e.c1.indexOf(d) : -1;
    if (at >= 0 && (at < bestPos || (at === bestPos && d.length > best.length))) { best = d; bestPos = at; }
  }
  // a PDF often cites other works' DOIs on its first page; if the first DOI it shows is a different one, that one is its own
  if (best && (e.r1 || e.meta)) {
    const re = /\b(10\.\d{4,9}\/[^\s"<>{}]+)/; const m = re.exec(e.meta || "") || re.exec(e.r1 || "");
    const first = m ? m[1].replace(/[.,;:\])]+$/, "").toLowerCase() : "";
    if (first && !first.startsWith(best) && !best.startsWith(first)) best = "";
  }
  OWNDOI.set(e, { lib: libDois, doi: best });
  return best;
}
function hasWord(t, w) { return !!w && (" " + t + " ").includes(" " + w + " "); }
function contentScore(it, f) {
  const e = pdfInfo(f); if (!e || e.error || !e.c) return 0;
  const title = it.title || ""; if (!title) return 0;
  const full = compactKey(title), main = compactKey(title.split(/[:?.]\s/)[0]);
  const metaT = compactKey(e.title || "");
  // a PDF's own title sits near the top of its first page (or cover page); the same words further down usually mean the PDF only cites it
  const TOP = 1500, at = full.length >= 15 ? e.c.indexOf(full) : -1, atMain = main.length >= 15 && main !== full ? e.c.indexOf(main) : -1;
  let s = 0;
  if (metaT.length >= 15 && metaT === full) s += 70;
  else if (at >= 0) s += at < TOP ? 70 : 30;
  else if (atMain >= 0) s += atMain < TOP ? 55 : 25;
  else {
    const words = spacedKey(title).split(" ").filter(w => w.length > 3 && !STOP.has(w));
    const top = e.t.slice(0, 1800);
    if (words.length >= 3) s += 45 * words.filter(w => hasWord(top, w)).length / words.length;
  }
  const au = (it.authors || []).filter(a => a.family || a.org);
  if (it.type !== "legal" && au.length) {
    const a0 = au[0].org ? spacedKey(au[0].org) : spacedKey(au[0].family);
    if (a0 && (au[0].org ? (" " + e.t + " ").includes(" " + a0 + " ") : hasWord(e.t, a0.split(" ").pop()))) s += 20;
    if (au[1] && au[1].family && hasWord(e.t, spacedKey(au[1].family).split(" ").pop())) s += 5;
  }
  if (it.year && hasWord(e.t, String(it.year))) s += 10;
  return s;
}
var LIBDOI = { n: -1, set: null };
function libDoiSet() { if (LIBDOI.items !== items || LIBDOI.n !== items.length) LIBDOI = { items, n: items.length, set: new Set(items.map(i => normDoi(i.doi)).filter(Boolean)) }; return LIBDOI.set; }
// best evidence that file f is item it: 200 for the same DOI, otherwise the stronger of the first-page and file-name scores
function matchScore(it, f, libDois) {
  const d = normDoi(it.doi);
  if (d && ownDoi(f, libDois || libDoiSet()) === d) return { s: 200, how: "doi" };
  const c = contentScore(it, f), n = scoreFile(it, f);
  return c >= n ? { s: c, how: "page" } : { s: n, how: "name" };
}
function accepted(m) { return m.how === "doi" || (m.how === "page" && m.s >= 75) || (m.how === "name" && m.s >= 60); }
async function loadFolder(folder) {
  const list = await window.citekeepApp.scanFolder(folder);
  PDF.folder = folder; PDF.name = folder.split(/[\\/]/).filter(Boolean).pop() || folder;
  if (PDFIDX && PDFIDX.folder !== folder) PDFIDX = null;
  PDF.files = list.map(f => ({ path: f.path, name: f.name, key: " " + fileKey(f.name) + " " }));
}
async function connectFolder() {
  const f = await window.citekeepApp.pickFolder();
  if (!f) return false;
  PDF.missing = "";
  await loadFolder(f);
  toast(`Found ${PDF.files.length} PDF${PDF.files.length === 1 ? "" : "s"} in “${PDF.name}”`);
  renderPdfCard(); renderDetail(); renderList();
  return true;
}
async function loadDrive(quiet) {
  const r = await window.citekeepApp.googleListPdfs();
  if (!r.ok) {
    if (r.error === "NOT_SIGNED_IN") { PDF.signedIn = false; } else if (!quiet) toast(r.error);
    renderPdfCard(); return false;
  }
  PDF.signedIn = true;
  PDF.drive = r.files.map(f => ({ path: "drive:" + f.id, name: f.name, link: f.webViewLink, key: " " + fileKey(f.name) + " " }));
  if (!quiet) toast(`Found ${PDF.drive.length} PDFs in your Google Drive`);
  renderPdfCard(); renderDetail();
  return true;
}
// "2023-24", "2023_2024", "2023–2024" → "2023-2024" (school years, fiscal years)
function yearRanges(t) {
  const out = new Set(); const re = /\b((?:19|20)\d\d)\s*[-–—_ ]\s*((?:19|20)?\d\d)\b/g; let m;
  while ((m = re.exec(String(t)))) { const a = +m[1]; let b = m[2].length === 2 ? Math.floor(a / 100) * 100 + +m[2] : +m[2]; if (b === a + 1) out.add(a + "-" + b); }
  return out;
}
function orgInitials(org) { return fold(org || "").split(/\s+/).filter(w => /^[A-Z]/.test(w) && !/^(Of|And|The|For|On|In)$/.test(w)).map(w => w[0]).join("").toLowerCase(); }
var DOC_KINDS = ["annual report", "action plan", "strategic plan", "improvement plan", "literacy plan", "newsletter", "quarterly update", "budget", "report card", "case study", "policy brief", "white paper"];
function scoreFile(it, f) {
  const a = (it.authors || [])[0];
  const who = it.type === "legal" ? "" : a ? fileKey(a.org ? a.org.split(" ")[0] : a.family) : "";
  const words = fileKey(it.title || "").split(" ").filter(w => w.length > 3 && !STOP.has(w)).slice(0, 6);
  let score = 0;
  if (who && who.length > 2 && f.key.includes(" " + who.split(" ")[0] + " ")) score += 40;
  else if (a && a.org) { const ab = (a.abbr || orgInitials(a.org)).toLowerCase(); if (ab.length >= 2 && f.key.includes(" " + ab + " ")) score += 40; }
  // a school-year range in the title must agree with one in the file name
  const tr = yearRanges(it.title || ""), fr = yearRanges(f.key);
  const rangeHit = [...tr].some(r => fr.has(r)), rangeMiss = tr.size && fr.size && !rangeHit;
  const fyrs = new Set((f.key.match(/\b(19|20)\d\d\b/g) || []).concat([...fr].flatMap(r => r.split("-"))));
  if (it.year && fyrs.has(it.year)) score += 20;
  if (words.length) score += 40 * words.filter(w => f.key.includes(" " + w + " ") || fyrs.has(w)).length / words.length;
  if (rangeHit) score += 25;
  if (rangeMiss) score -= 40;
  else if (it.year && fyrs.size && !fyrs.has(it.year) && !rangeHit) score -= 25;
  const tk = " " + fileKey(it.title || "") + " ";
  const tkinds = DOC_KINDS.filter(k => tk.includes(" " + k + " ")), fkinds = DOC_KINDS.filter(k => f.key.includes(" " + k + " "));
  if (tkinds.some(k => fkinds.includes(k))) score += 20;
  else if (tkinds.length && fkinds.length) score -= 40; // an action plan is not an annual report
  return score;
}
function suggestFiles(it, n = 6) { const L = libDoiSet(); return allFiles().map(f => { const m = matchScore(it, f, L); return [m.s, f, m.how]; }).filter(x => x[0] > 15).sort((a, b) => b[0] - a[0]).slice(0, n); }
function fileLabel(f) { return f.path.startsWith("drive:") ? f.name + " (Google Drive)" : f.path; }
function storedLabel(it) { return it.fileName ? it.fileName + (String(it.file).startsWith("drive:") ? " (Google Drive)" : "") : it.file; }
async function linkFile(it, f) { await saveItem(Object.assign({}, it, { file: f.path, fileName: f.name, fileLink: f.link || "" })); }
async function matchAll() {
  const pool = allFiles();
  if (!pool.length) { toast("Connect a PDF folder or Google Drive first"); return; }
  if (canReadPdfs() && PDF.folder) {
    await indexPdfs((d, t) => { const n2 = document.getElementById("pdfProg"); if (n2) n2.textContent = `Reading inside your PDFs: ${d} of ${t}…`; });
    const n2 = document.getElementById("pdfProg"); if (n2) n2.textContent = "";
  }
  const L = libDoiSet();
  const taken = new Set(items.filter(i => i.file).map(i => i.file));
  const pairs = [];
  for (const it of items) if (!it.file) for (const f of pool) if (!taken.has(f.path)) { const m = matchScore(it, f, L); if (accepted(m)) pairs.push([m.s, it, f, m.how]); }
  pairs.sort((x, y) => y[0] - x[0]);
  const usedI = new Set(), usedF = new Set(taken); const how = { doi: 0, page: 0, name: 0 }; let n = 0;
  for (const [s, it, f, h] of pairs) {
    if (usedI.has(it.id) || usedF.has(f.path)) continue;
    if (h !== "doi") {
      const rival = pairs.find(p => p[1] === it && p[2] !== f && !usedF.has(p[2].path) && p[2].name !== f.name);
      if (rival && s - rival[0] < 10) continue;
      const rivalItem = pairs.find(p => p[2] === f && p[1] !== it && !usedI.has(p[1].id));
      if (rivalItem && s - rivalItem[0] < 10) continue;
    }
    usedI.add(it.id); usedF.add(f.path);
    await linkFile(it, f); n++; how[h]++;
  }
  const parts = [how.doi && `${how.doi} by DOI`, how.page && `${how.page} by title and authors`, how.name && `${how.name} by file name`].filter(Boolean);
  toast(`Linked ${n} reference${n === 1 ? "" : "s"} to PDFs` + (parts.length ? ` (${parts.join(", ")})` : ""));
  renderPdfCard();
}
async function openCopy(it) {
  if (!it.file) return;
  if (String(it.file).startsWith("drive:")) {
    const f = PDF.drive.find(x => x.path === it.file);
    const link = (f && f.link) || it.fileLink || "https://drive.google.com/file/d/" + it.file.slice(6) + "/view";
    window.citekeepApp.openLink(link); return;
  }
  if (!PDF.folder) { toast("Connect your PDF folder in Settings"); return; }
  const err = await window.citekeepApp.openPdf(PDF.folder, it.file);
  if (err) toast(`Couldn't open “${it.file}”. It may have been moved or renamed.`);
}
function renderCopyRow(it) {
  if (typeof PDF === "undefined" || !PDF) return;
  const row = document.getElementById("copyRow"); if (!row) return;
  if (it.file) {
    row.innerHTML = `<button class="btn primary" id="openCopy">Open my copy</button><span class="note" style="overflow-wrap:anywhere">${esc(storedLabel(it))}</span><button class="copy" id="changeCopy">Change</button><button class="copy" id="unlinkCopy">Unlink</button>`;
    $("#openCopy").onclick = () => openCopy(it);
    $("#changeCopy").onclick = () => pickCopy(it);
    $("#unlinkCopy").onclick = async () => { const c = Object.assign({}, it, { file: "", fileName: "", fileLink: "" }); await saveItem(c); toast("Unlinked"); renderDetail(); renderList(); };
  } else {
    const has = allFiles().length;
    row.innerHTML = `<button class="btn" id="findCopy">${has ? "Find my copy" : "Connect your PDFs"}</button><span class="note">${has ? "in your PDF folder or Google Drive" : "to open your own PDF of this reference"}</span>`;
    $("#findCopy").onclick = () => { if (!has) { showTab("settings"); return; } pickCopy(it); };
    if (typeof afterCopyRow === "function") afterCopyRow(it, row);
  }
}
async function pickCopy(it) {
  const row = document.getElementById("copyRow"); if (!row) return;
  if (canReadPdfs() && PDF.folder && !PDFREAD.busy) { row.innerHTML = `<span class="note" id="pdfProg2">Looking inside your PDFs…</span>`; await indexPdfs((d, t) => { const n2 = document.getElementById("pdfProg2"); if (n2) n2.textContent = `Reading inside your PDFs: ${d} of ${t}…`; }); }
  const sug = suggestFiles(it);
  const draw = q => {
    const qk = fileKey(q); const pool = q ? allFiles().filter(f => { const e = pdfInfo(f); return f.key.includes(qk) || (e && e.t && (" " + e.t + " ").includes(" " + qk)); }).slice(0, 15).map(f => [0, f]) : sug;
    row.querySelector("#copyList").innerHTML = pool.length ? pool.map(([sc, f, h]) => { const e = pdfInfo(f); const t = e && e.title && e.title.length > 12 && !/^microsoft|\.docx?$|^untitled/i.test(e.title) ? e.title : ""; return `<button class="item" data-path="${esc(f.path)}" style="border:1px solid var(--line);border-radius:6px;margin-bottom:4px"><div class="ttl" style="font-size:13.5px">${esc(f.name)}${h === "doi" ? ` <span class="pill ok">DOI matches</span>` : h === "page" && sc >= 75 ? ` <span class="pill ok">title on first page</span>` : ""}</div>${t ? `<div class="note">${esc(t)}</div>` : ""}<div class="note">${esc(f.path.startsWith("drive:") ? "Google Drive" : f.path)}</div></button>`; }).join("") : `<div class="note">No matching PDFs. Try a different word from the title or file name.</div>`;
  };
  row.innerHTML = `<div style="display:grid;gap:6px;width:100%"><div class="note">${sug.length ? "Likely files, best first. Pick one, or search." : "No likely file found. Search by a word from the title or file name."}</div><input type="search" id="copyQ" placeholder="Search file names and first pages"><div id="copyList"></div><div><button class="btn" id="copyCancel">Cancel</button></div></div>`;
  draw("");
  $("#copyQ").oninput = e => draw(e.target.value.trim());
  $("#copyCancel").onclick = () => renderCopyRow(it);
  row.querySelector("#copyList").onclick = async e => { const b = e.target.closest("[data-path]"); if (!b) return; const f = allFiles().find(x => x.path === b.dataset.path); if (f) { await linkFile(it, f); toast("Linked to your copy"); renderDetail(); renderList(); } };
}
function renderPdfCard() {
  if (typeof PDF === "undefined" || !PDF) return;
  const c = document.getElementById("pdfCard"); if (!c) return;
  const S = PDF.settings || {};
  const linked = items.filter(i => i.file);
  const linkedPaths = new Set(linked.map(i => i.file));
  const noFile = items.filter(i => !i.file);
  const loose = allFiles().filter(f => !linkedPaths.has(f.path));
  c.innerHTML = `<h3 style="margin:0">Your PDFs</h3>
    <p class="note" style="margin:0">Link each reference to your own PDF, from a folder on this computer, your Google Drive, or both. Citekeep matches each PDF to its reference by the DOI printed in it, then by the title and authors on its first pages, and last by the file name, so files can be named anything. Nothing is renamed or moved.</p>
    ${PDF.missing && !PDF.folder ? `<div class="banner" style="margin:0">Your PDF folder (${esc(PDF.missing)}) isn't on this computer. Click Choose PDF folder to point Citekeep to it. Your PDF links are kept and reconnect once the folder is found.</div>` : ""}
    <div class="row"><button class="btn" id="pdfConnect">${PDF.folder ? "Change PDF folder" : "Choose PDF folder"}</button>${PDF.folder ? `<span class="note">“${esc(PDF.name)}”: ${PDF.files.length} PDFs</span>` : ""}</div>
    <div class="row">${PDF.signedIn ? `<button class="btn" id="gRefresh">Refresh Google Drive</button><button class="btn" id="gList">List a Drive folder</button><button class="copy" id="gOut">Sign out</button><span class="note">Google Drive: ${PDF.drive.length} PDFs</span>` : `<button class="btn" id="gIn" ${S.gClientId ? "" : "disabled"}>Sign in to Google Drive</button>${S.gClientId ? "" : `<span class="note">Needs a Client ID (below)</span>`}`}</div>
    ${allFiles().length ? `<div class="row"><button class="btn primary" id="pdfMatch">Match files to references</button><span class="note">${linked.length} of ${items.length} references linked</span><span class="note" id="pdfProg"></span></div>` : ""}
    ${allFiles().length && noFile.length ? `<details><summary class="note" style="cursor:pointer">References without a file (${noFile.length})</summary><ul class="stylist">${noFile.slice(0, 400).map(i => `<li>${esc(citeForms(i).parenthetical)} ${esc((i.title || "").slice(0, 70))}</li>`).join("")}</ul></details>` : ""}
    ${loose.length ? `<details><summary class="note" style="cursor:pointer">Files not linked to any reference (${loose.length})</summary><ul class="stylist">${loose.slice(0, 400).map(f => { const e = pdfInfo(f); return `<li>${esc(fileLabel(f))}${e && e.error ? ` <span class="note">(couldn't be read)</span>` : e && !e.c ? ` <span class="note">(no text inside; likely a scan)</span>` : ""}</li>`; }).join("")}</ul></details>` : ""}
    <details${S.gClientId ? "" : " open"}><summary class="note" style="cursor:pointer">Google Drive setup</summary>
      <ol class="stylist" style="padding-left:20px">
        <li>Go to <b>console.cloud.google.com</b>, sign in with the Google account that holds your Drive, and create a project named Citekeep (project picker at the top left → New project). Keep that project selected for every step below.</li>
        <li>Turn on the Drive API: go to <b>console.cloud.google.com/apis/library/drive.googleapis.com</b> and click <b>Enable</b>.</li>
        <li>Set up sign-in: go to <b>console.cloud.google.com/auth/overview</b> and click <b>Get started</b>. App name: Citekeep. Support email: your address. Audience: <b>External</b>. Contact email: your address. Agree and click <b>Create</b>.</li>
        <li><b>Add yourself as a test user</b> (skipping this causes “Access blocked: Citekeep has not completed the Google verification process”): go to <b>console.cloud.google.com/auth/audience</b>, leave Publishing status on <b>Testing</b>, and under <b>Test users</b> click <b>+ Add users</b>, enter the Gmail address you'll sign in with, and save.</li>
        <li>Create the client: go to <b>console.cloud.google.com/auth/clients</b>, click <b>Create client</b>, choose Application type <b>Desktop app</b>, name it Citekeep, and click <b>Create</b>.</li>
        <li>Copy the <b>Client ID</b> and <b>Client secret</b> into the boxes below and click Save. (Click the client's name to see them again; if the secret is hidden, use <b>Add secret</b>.) Then click <b>Sign in to Google Drive</b>.</li>
        <li>In the browser, if Google says the app isn't verified, click <b>Continue</b>; that's normal for your own project. Make sure you pick the same Google account you added as a test user. When the Citekeep page shows a code, click Copy and paste it into Citekeep.</li>
      </ol>
      <p class="note">Citekeep asks only to see the names and links of your Drive files, not their contents. While the Google project stays in Testing, Google asks you to sign in again about once a week.</p>
      <label class="f"><span>Client ID</span><input type="text" id="gId" value="${esc(S.gClientId || "")}" placeholder="…apps.googleusercontent.com"></label>
      <label class="f"><span>Client secret</span><input type="text" id="gSecret" placeholder="${S.gClientSecret ? "Saved. Enter a new one to replace it." : "GOCSPX-…"}"></label>
      <div class="row" style="margin-top:6px"><button class="btn" id="gSave">Save</button></div>
    </details>`;
  if (typeof afterPdfCard === "function") afterPdfCard(c);
  $("#pdfConnect").onclick = () => connectFolder();
  const m = $("#pdfMatch"); if (m) m.onclick = async () => { m.disabled = true; await matchAll(); m.disabled = false; };
  const gi = $("#gIn"); if (gi) gi.onclick = async () => {
    gi.disabled = true; gi.textContent = "Waiting for Google… finish in your browser";
    const r = await window.citekeepApp.googleSignIn();
    if (r.pending) {
      gi.insertAdjacentHTML("afterend", `<div id="gCodeBox" style="display:grid;gap:6px;width:100%"><span class="note">Sign in to Google in your browser. When it shows a code, copy it and paste it here.</span><input type="text" id="gCode" placeholder="Paste the code from your browser"><div class="row"><button class="btn primary" id="gFinish">Finish sign-in</button><button class="btn" id="gCancel">Cancel</button></div></div>`);
      gi.hidden = true;
      $("#gCancel").onclick = () => renderPdfCard();
      $("#gFinish").onclick = async () => {
        const b = $("#gFinish"); b.disabled = true;
        const f = await window.citekeepApp.googleFinish($("#gCode").value);
        if (!f.ok) { toast(f.error); b.disabled = false; return; }
        toast("Connected to Google Drive"); await loadDrive(false);
      };
      return;
    }
    if (!r.ok) { toast(r.error); gi.disabled = false; gi.textContent = "Sign in to Google Drive"; return; }
    toast("Connected to Google Drive"); await loadDrive(false);
  };
  const gr = $("#gRefresh"); if (gr) gr.onclick = () => loadDrive(false);
  if (typeof bindDriveList === "function") bindDriveList(c);
  const go = $("#gOut"); if (go) go.onclick = async () => { await window.citekeepApp.googleSignOut(); PDF.signedIn = false; PDF.drive = []; renderPdfCard(); toast("Signed out of Google Drive"); };
  $("#gSave").onclick = async () => {
    const id = $("#gId").value.trim(), sec = $("#gSecret").value.trim();
    await window.citekeepApp.setSetting("gClientId", id);
    if (sec) await window.citekeepApp.setSetting("gClientSecret", sec);
    PDF.settings = await window.citekeepApp.getSettings(); PDF.signedIn = false; PDF.drive = [];
    toast(id ? "Saved. Now sign in to Google Drive." : "Cleared"); renderPdfCard();
  };
}
(async () => {
  try { PDF.settings = await window.citekeepApp.getSettings(); } catch { PDF.settings = {}; }
  if (PDF.settings.pdfFolder) {
    try { await loadFolder(PDF.settings.pdfFolder); if (canReadPdfs()) await loadPdfIndex(); }
    catch (e) {
      // the saved folder isn't here (a new computer, or a different drive letter): look for it by name
      let found = null; try { found = window.citekeepApp.findFolder ? await window.citekeepApp.findFolder(PDF.settings.pdfFolder) : null; } catch (x) {}
      if (found) { try { await window.citekeepApp.setSetting("pdfFolder", found); await loadFolder(found); if (canReadPdfs()) await loadPdfIndex(); toast("Found your PDF folder at " + found); } catch (x) { PDF.missing = PDF.settings.pdfFolder; } }
      else PDF.missing = PDF.settings.pdfFolder;
    }
  }
  if (PDF.settings.gSignedIn) await loadDrive(true);
  renderPdfCard(); renderDetail();
  if (typeof startDownloadsWatch === "function") startDownloadsWatch();
})();
