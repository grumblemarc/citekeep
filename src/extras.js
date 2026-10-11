// ===== Citekeep extras: retraction alerts, several chapters at once, hand-adjusted reference order =====

// ---------- shared: save a list of APA entries (HTML with <i>) as a Word file ----------
async function saveEntriesDocx(htmlList, filename) {
  if (!downloads) { toast("Saving files isn't available here."); return; }
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const paras = `<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>References</w:t></w:r></w:p>` +
    htmlList.map(h => `<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto" w:after="0"/><w:ind w:left="720" w:hanging="720"/></w:pPr>${runsXml(h)}</w:p>`).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${paras}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  try { const blob = await zip.generateAsync({ type: "blob" }); await downloads.save({ filename, data: blob }); toast("Saved"); }
  catch (e) { if (e.code !== "declined") toast("Couldn't save the file."); }
}

// ---------- 1. retractions, corrections, expressions of concern (Crossref) ----------
const NOTICE = {
  retraction: ["Retracted", "bad"], partial_retraction: ["Partly retracted", "bad"], withdrawal: ["Withdrawn", "bad"], removal: ["Removed", "bad"],
  expression_of_concern: ["Expression of concern", "warn"], correction: ["Corrected", "ok"], erratum: ["Erratum", "ok"], corrigendum: ["Corrigendum", "ok"],
  clarification: ["Clarification", "ok"], addendum: ["Addendum", "ok"],
};
function noticeLabel(t) { return (NOTICE[t] || [String(t || "Update").replace(/_/g, " ").replace(/^./, c => c.toUpperCase()), "ok"]); }
function dateOf(d) { const p = d && d["date-parts"] && d["date-parts"][0]; return p ? p.filter(Boolean).map((x, i) => i ? String(x).padStart(2, "0") : x).join("-") : ""; }
async function crossrefNotices(doi) {
  const out = [];
  const r = await fetch("https://api.crossref.org/works/" + encodeURIComponent(doi));
  if (r.status === 404) return { missing: true, notes: [] };
  if (!r.ok) throw new Error("Crossref didn't answer");
  const m = (await r.json()).message || {};
  for (const u of m["updated-by"] || []) out.push({ type: u.type, doi: u.DOI, date: dateOf(u.updated) });
  try {
    const r2 = await fetch("https://api.crossref.org/works?rows=20&filter=updates:" + encodeURIComponent(doi));
    if (r2.ok) for (const it of ((await r2.json()).message || {}).items || []) for (const u of it["update-to"] || []) if (String(u.DOI || "").toLowerCase() === doi.toLowerCase()) out.push({ type: u.type, doi: it.DOI, date: dateOf(u.updated) });
  } catch (e) {}
  const seen = new Set();
  return { notes: out.filter(n => n.type !== "new_version" && !seen.has(n.type + n.doi) && seen.add(n.type + n.doi)) };
}
function noticeHtml(it) {
  if (!it || !(it.notices || []).length) return "";
  return `<div class="row">${it.notices.map(n => { const [lab, cls] = noticeLabel(n.type); return `<span class="pill ${cls}">${esc(lab)}${n.date ? " " + esc(n.date) : ""}</span> <a class="doi" href="https://doi.org/${esc(n.doi)}" target="_blank" rel="noopener" data-doi="${esc(n.doi)}">notice</a>`; }).join(" ")}<span class="note">from Crossref, ${esc(it.noticesChecked || "")}</span></div>`;
}
function afterRenderCheck(r) {
  const out = $("#checkOut"); if (!out || !r || !r.entries) return;
  const withDoi = r.entries.filter(e => e.ref.doi);
  const sec = document.createElement("div");
  sec.innerHTML = `<h3>Retractions and corrections</h3><p class="note" style="margin-top:0">Asks Crossref whether any cited study has been retracted, corrected, or flagged with an expression of concern. Covers the ${withDoi.length} references with a DOI; the others can't be checked this way. No notice on record isn't a guarantee, since not every publisher reports them.</p><div class="row"><button class="btn" id="rwBtn" ${withDoi.length ? "" : "disabled"}>Check ${withDoi.length} DOIs with Crossref</button><span class="note" id="rwNote"></span></div><div id="rwOut"></div>`;
  const anchor = out.querySelector("details.doclist");
  anchor ? out.insertBefore(sec, anchor) : out.appendChild(sec);
  $("#rwBtn").onclick = async () => {
    const b = $("#rwBtn"), note = $("#rwNote"); b.disabled = true;
    const found = []; let done = 0, failed = 0, missing = 0;
    const queue = withDoi.slice();
    const today = new Date().toISOString().slice(0, 10);
    const work = async () => {
      while (queue.length) {
        const e = queue.shift();
        try { const res = await crossrefNotices(e.ref.doi); if (res.missing) missing++; if (res.notes.length) found.push({ e, notes: res.notes }); }
        catch (err) { failed++; }
        done++; note.textContent = `Checked ${done} of ${withDoi.length}…`;
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    note.textContent = "";
    const lib = r.lib;
    for (const f of found) {
      const hit = lib && lib.inLib.find(x => x.entry === f.e);
      const it = hit && items.find(i => i.id === hit.itemId);
      if (it) await saveItem(Object.assign({}, it, { notices: f.notes, noticesChecked: today }));
    }
    const bad = found.filter(f => f.notes.some(n => noticeLabel(n.type)[1] === "bad"));
    $("#rwOut").innerHTML = (found.length ? `<div class="tbl-wrap"><table><thead><tr><th>Notice</th><th>Reference</th></tr></thead><tbody>${found.map(f => `<tr><td>${f.notes.map(n => { const [lab, cls] = noticeLabel(n.type); return `<span class="pill ${cls}">${esc(lab)}</span>${n.date ? ` <span class="note">${esc(n.date)}</span>` : ""} <a class="doi" href="https://doi.org/${esc(n.doi)}" target="_blank" rel="noopener" data-doi="${esc(n.doi)}">notice</a>`; }).join("<br>")}</td><td style="font-family:var(--serif)">${linkDOIs(runHtml(f.e.p))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="allgood">No retractions, corrections or expressions of concern on record for any of the ${withDoi.length - failed - missing} DOIs checked.</div>`)
      + (bad.length ? `<p class="note">A retracted study generally shouldn't be cited as evidence. If you keep it, say in the text that it was retracted.</p>` : "")
      + (missing ? `<p class="note">${missing} DOI${missing === 1 ? " isn't" : "s aren't"} registered with Crossref (some publishers use a different registry), so ${missing === 1 ? "it" : "they"} couldn't be checked.</p>` : "")
      + (failed ? `<p class="note">${failed} couldn't be checked because Crossref didn't answer. Try again in a minute.</p>` : "")
      + `<p class="note">Checked with Crossref on ${today}.</p>`;
    b.disabled = false; b.textContent = "Check again";
  };
}

// ---------- 2. several chapters at once ----------
let lastMulti = null;
async function runMulti(files) {
  const out = $("#checkOut");
  files = files.filter(f => /\.docx$/i.test(f.name));
  if (!files.length) { out.innerHTML = `<p class="banner">Choose Word files saved as .docx.</p>`; return; }
  out.innerHTML = `<p class="note" style="margin-top:14px">Reading ${files.length} documents…</p>`;
  const docs = [];
  for (const f of files) {
    try {
      const zip = await JSZip.loadAsync(f);
      const xml = await zip.file("word/document.xml").async("string");
      let styles = null; try { const sx = zip.file("word/styles.xml"); styles = sx ? loadStyles(await sx.async("string")) : null; } catch (e) {}
      const dom = new DOMParser().parseFromString(xml, "application/xml");
      DOC_STYLES = styles;
      const rd = readDocument(dom);
      const bodyText = rd.bodyParas.map(paraText).join("\n");
      const entries = docEntries(rd.refParas, bodyText).map(e => Object.assign(e, { html: runHtml(e.p), text: norm(paraText(e.p)) }));
      docs.push({ name: f.name.replace(/\.docx$/i, ""), dom, rd, entries, styles });
    } catch (e) { docs.push({ name: f.name, error: true }); }
  }
  // one combined reference list, merged by author and year
  const combined = new Map();
  for (const d of docs) if (!d.error) for (const e of d.entries) {
    const key = norm(e.forms[0] || "") + "|" + e.year;
    if (!combined.has(key)) combined.set(key, { id: "c" + combined.size, forms: e.forms.slice(), year: e.year, ref: e.ref, versions: [], lists: new Set(), citedIn: new Map() });
    const c = combined.get(key);
    for (const f of e.forms) if (!c.forms.includes(f)) c.forms.push(f);
    c.lists.add(d.name);
    if (!c.versions.some(v => v.text.replace(/\W/g, "").toLowerCase() === e.text.replace(/\W/g, "").toLowerCase())) c.versions.push({ doc: d.name, html: e.html, text: e.text, ref: e.ref });
  }
  const C = [...combined.values()];
  const F = buildFormIndex(C);
  const unmatched = [];
  for (const d of docs) {
    if (d.error) continue;
    d.cites = 0; d.borrowed = new Set();
    for (const p of d.rd.bodyParas) {
      const t = paraText(p); if (!t.trim()) continue;
      const r = findCitations(t, F);
      for (const s of r.spans) { const c = C.find(x => x.id === s[2]); c.citedIn.set(d.name, (c.citedIn.get(d.name) || 0) + 1); d.cites++; if (d.rd.refParas.length && !c.lists.has(d.name)) d.borrowed.add(c); }
      for (const m of r.misses) { m.doc = d.name; m.candidates = candidatesFor(m, C, null); unmatched.push(m); }
    }
  }
  const never = C.filter(c => !c.citedIn.size);
  const conflicts = C.filter(c => c.versions.length > 1);
  // pull everything into the library, as opening one document does
  const have = new Set(items.map(dedupKey));
  const toAdd = C.map(c => { const v = c.versions[0], x = v.ref; const it = { type: x.type, authors: x.authors, year: x.year, suffix: x.suffix, date: x.date, title: x.title, refHtml: v.html, useRaw: true, tags: [...c.lists] }; for (const k of ["doi", "url", "legal"]) if (x[k]) it[k] = x[k]; return it; }).filter(it => !have.has(dedupKey(it)));
  const res = toAdd.length ? await addMany(toAdd) : { added: 0 };
  lastMulti = { docs, C };
  const stat = (n, label, cls) => `<div class="stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  let h = `<h3>${docs.length} documents checked together</h3>
    <div class="allgood" style="margin-bottom:4px">${res.added ? `Pulled ${res.added} new reference${res.added === 1 ? "" : "s"} into your library.` : "No new references to pull in."} Your library now holds ${items.length}.</div>
    <div class="stats">${stat(C.length, "references across all lists", "")}${stat(docs.reduce((n, d) => n + (d.cites || 0), 0), "citations matched", "ok")}${stat(unmatched.length, "citations with no entry in any list", unmatched.length ? "bad" : "ok")}${stat(never.length, "references not cited in any document", never.length ? "warn" : "ok")}${stat(conflicts.length, "references written differently in different lists", conflicts.length ? "warn" : "ok")}</div>
    <div class="row" style="margin-bottom:6px">${downloads ? `<button class="btn primary" id="saveCombined">Save the combined reference list (.docx)</button>` : ""}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Document</th><th>Citations</th><th>Own reference list</th><th>Cites sources listed only in another document</th></tr></thead><tbody>
    ${docs.map(d => d.error ? `<tr><td>${esc(d.name)}</td><td colspan="3"><span class="pill bad">Couldn't read this file</span></td></tr>` : `<tr><td>${esc(d.name)}</td><td class="mono">${d.cites}</td><td class="mono">${d.rd.hasRefHeading ? d.entries.length + " entries" : "none"}</td><td>${d.rd.refParas.length ? (d.borrowed.size ? `<details><summary class="note" style="cursor:pointer">${d.borrowed.size}</summary><ul class="stylist">${[...d.borrowed].map(c => `<li>${esc(c.versions[0].text.slice(0, 90))}…</li>`).join("")}</ul></details>` : "None") : `<span class="note">No list of its own; checked against the combined list</span>`}</td></tr>`).join("")}
    </tbody></table></div>`;
  if (unmatched.length) h += `<h3>Citations with no entry in any reference list</h3><div class="tbl-wrap"><table><thead><tr><th>Document</th><th>Citation</th><th>In the text</th><th>Closest entry</th></tr></thead><tbody>${unmatched.map(m => `<tr><td>${esc(m.doc)}</td><td class="mono">${esc(m.name)}, ${esc(m.years)}</td><td class="ctx">…${esc(m.context)}</td><td>${m.candidates[0] ? esc(m.candidates[0].versions[0].text.slice(0, 90)) + "…" : `<span class="pill bad">No entry</span>`}</td></tr>`).join("")}</tbody></table></div>`;
  if (never.length) h += `<details class="sty"><summary><span class="pill warn">${never.length}</span> References not cited in any document</summary><ul class="stylist">${never.map(c => `<li>${esc(c.versions[0].text)} <span class="note">(listed in ${esc([...c.lists].join(", "))})</span></li>`).join("")}</ul></details>`;
  if (conflicts.length) h += `<details class="sty"><summary><span class="pill warn">${conflicts.length}</span> References written differently in different lists</summary><p class="note">The same source appears with different wording. The combined list uses the first version shown; fix the others to match.</p><ul class="stylist">${conflicts.map(c => `<li>${c.versions.map(v => `<b>${esc(v.doc)}:</b> ${esc(v.text)}`).join("<br>")}</li>`).join("")}</ul></details>`;
  h += `<details class="sty"><summary><span class="pill ok">${C.length}</span> How often each source is cited, by document</summary><ul class="stylist">${C.slice().sort((a, b) => [...b.citedIn.values()].reduce((x, y) => x + y, 0) - [...a.citedIn.values()].reduce((x, y) => x + y, 0)).map(c => `<li>${esc((c.forms.find(f => /^[A-Z]{2,10}$/.test(f)) || c.forms[0] || "") + " (" + c.year + ")")}: ${c.citedIn.size ? [...c.citedIn].map(([d, n]) => `${esc(d)} ${n}×`).join(", ") : "not cited"}</li>`).join("")}</ul></details>`;
  out.innerHTML = h;
  const sc = $("#saveCombined");
  if (sc) sc.onclick = () => {
    const list = C.map(c => Object.assign({}, c.versions[0].ref, { refHtml: c.versions[0].html, useRaw: true, _key: null }));
    assignSuffixes(list);
    list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    saveEntriesDocx(list.map(formatReference), "Combined References.docx");
  };
}

// ---------- 3. hand-adjusted order in the reference list ----------
let bibEditing = false;
function orderKey(it) { return it.sortOverride || sortKey(it); }
function currentBib() {
  const S = bibSources(), sel = $("#bibSrc");
  const cur = sel.value || "all";
  sel.innerHTML = S.map(s => `<option value="${esc(s.key)}" ${s.key === cur ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  const src = (S.find(s => s.key === sel.value) || S[0]).pick().map(x => Object.assign({}, x));
  assignSuffixes(src);
  return src.sort((a, b) => { const x = orderKey(a), y = orderKey(b); return x < y ? -1 : x > y ? 1 : 0; });
}
// a sort key that falls strictly between a and b (b null = after a); keeps characters below the surrogate range
function keyBetween(a, b) {
  const TOP = 0xD7FF;
  if (b != null && !(a < b)) return a + "耀";
  let r = "";
  for (let i = 0; i < 4000; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = b == null || i >= b.length ? TOP : b.charCodeAt(i);
    if (ca === cb) { r += String.fromCharCode(ca); continue; }
    if (cb - ca > 1) return r + String.fromCharCode((ca + cb) >> 1);
    return r + String.fromCharCode(ca) + a.slice(i + 1) + "耀";
  }
  return a + "耀";
}
let bibDrag = null;
// while dragging near the top or bottom of the window, scroll so an entry can travel the whole list
function bibScroller() { let n = $("#bibOut"); while (n && n !== document.body) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return null; }
function bibAutoScroll(y) {
  const edge = 70, h = window.innerHeight;
  const d = y < edge ? -Math.ceil((edge - y) / 3) : y > h - edge ? Math.ceil((y - (h - edge)) / 3) : 0;
  if (!d) return;
  const s = bibScroller(); if (s) s.scrollTop += d; else window.scrollBy(0, d);
}
document.addEventListener("dragover", e => { if (bibDrag != null && !$("#bibOut").contains(e.target)) { e.preventDefault(); bibAutoScroll(e.clientY); } });
function renderBib() {
  const list = currentBib();
  const moved = list.filter(i => i.sortOverride).length;
  let bar = document.getElementById("bibOrderBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "bibOrderBar"; bar.className = "row"; bar.style.margin = "-4px 0 12px"; $("#bibOut").before(bar); }
  bar.innerHTML = `<button class="btn${bibEditing ? " primary" : ""}" id="bibEdit">${bibEditing ? "Done adjusting" : "Adjust order"}</button>${bibEditing ? `<span class="note">Drag any entry up or down to move it.</span>` : ""}${moved ? `<span class="note">${moved} entr${moved === 1 ? "y" : "ies"} placed by hand</span><button class="copy" id="bibReset">Return to automatic order</button>` : bibEditing ? "" : `<span class="note">Sorted automatically by author, then year</span>`}`;
  $("#bibEdit").onclick = () => { bibEditing = !bibEditing; renderBib(); };
  const rs = $("#bibReset"); if (rs) rs.onclick = async () => { for (const it of items.filter(i => i.sortOverride)) await saveItem(Object.assign({}, it, { sortOverride: "" })); toast("Back to automatic order"); renderBib(); };
  const out = $("#bibOut");
  out.classList.toggle("ordering", bibEditing);
  out.innerHTML = list.length ? `<h4>References</h4>` + list.map((it, i) => `<p data-item="${it.id}" data-i="${i}"${bibEditing ? ` draggable="true"` : ""}>${bibEditing ? `<span class="grip" title="Drag to move" aria-hidden="true">⠿</span>` : ""}${linkDOIs(formatReference(it))}${it.sortOverride && bibEditing ? ` <span class="note">(placed by hand)</span>` : ""}</p>`).join("") : `<div class="empty"><b>Nothing to list yet</b>Add references to your library, then come back to build the list.</div>`;
  $("#bibSave").hidden = !downloads;
  out.ondragstart = out.ondragover = out.ondragleave = out.ondrop = out.ondragend = null;
  if (!bibEditing) return;
  const clear = () => out.querySelectorAll(".drop-before,.drop-after").forEach(x => x.classList.remove("drop-before", "drop-after"));
  const slotFor = e => { const p = e.target.closest && e.target.closest("p[data-i]"); if (!p) return null; const r = p.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; return { p, slot: +p.dataset.i + (after ? 1 : 0), after }; };
  out.ondragstart = e => { const p = e.target.closest && e.target.closest("p[data-i]"); if (!p) return; bibDrag = +p.dataset.i; p.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", p.dataset.item); } catch (x) {} };
  out.ondragover = e => { if (bibDrag == null) return; bibAutoScroll(e.clientY); const s = slotFor(e); if (!s) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; clear(); s.p.classList.add(s.after ? "drop-after" : "drop-before"); };
  out.ondragleave = e => { if (!out.contains(e.relatedTarget)) clear(); };
  out.ondragend = () => { clear(); out.querySelectorAll(".dragging").forEach(x => x.classList.remove("dragging")); bibDrag = null; };
  out.ondrop = async e => {
    e.preventDefault();
    const from = bibDrag, s = slotFor(e); clear(); bibDrag = null;
    if (from == null || !s || s.slot === from || s.slot === from + 1) return;
    const keys = list.map(orderKey);
    const nk = keyBetween(s.slot > 0 ? keys[s.slot - 1] : "", s.slot < list.length ? keys[s.slot] : null);
    const it = items.find(x => x.id === list[from].id);
    if (it) { await saveItem(Object.assign({}, it, { sortOverride: nk })); renderBib(); }
  };
}
