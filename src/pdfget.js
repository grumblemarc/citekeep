// ===== Getting PDFs: free legal copies (Unpaywall), a title search, and filing what lands in Downloads =====
var GET = { searched: {}, dl: "", seen: new Map(), pending: new Map(), timer: null, filed: [], unfiled: [], busy: false, free: null };

function safeName(s) { return String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim(); }
function pdfNameFor(it) {
  const f = citeForms(it).narrative.replace(/[()]/g, "");
  const t = (it.title || "").split(/[:?.]\s/)[0];
  let n = safeName(f + " - " + t);
  if (n.length > 110) n = n.slice(0, 110).replace(/\s+\S*$/, "");
  return n.replace(/[ .,;:-]+$/, "") + ".pdf";
}
function markSearched(it) { GET.searched[it.id] = Date.now(); }
function recentlySearched(id) { const t = GET.searched[id]; return t && Date.now() - t < 45 * 60 * 1000; }

// ---------- Unpaywall ----------
async function unpaywallEmail() {
  const s = PDF.settings || {};
  if (s.unpaywallEmail) return s.unpaywallEmail;
  const e = (prompt("Unpaywall, the free service that finds legal open-access copies, asks for an email address with each lookup. It isn't used for anything else. Your email:") || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(e)) return "";
  await window.citekeepApp.setSetting("unpaywallEmail", e); s.unpaywallEmail = e; PDF.settings = s;
  return e;
}
async function unpaywall(doi, email) {
  const r = await fetch("https://api.unpaywall.org/v2/" + encodeURIComponent(normDoi(doi)) + "?email=" + encodeURIComponent(email));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Unpaywall didn't answer");
  const j = await r.json();
  const locs = [j.best_oa_location].concat(j.oa_locations || []).filter(l => l && (l.url_for_pdf || l.url));
  const withPdf = locs.find(l => l.url_for_pdf);
  if (!withPdf && !locs.length) return null;
  const l = withPdf || locs[0];
  return { url: l.url_for_pdf || l.url, page: l.url_for_landing_page || l.url || "", pdf: !!l.url_for_pdf, host: (() => { try { return new URL(l.url_for_pdf || l.url).hostname.replace(/^www\./, ""); } catch { return ""; } })(), version: l.version || "" };
}
// try to save the PDF directly; if the site won't allow it, open it in the browser and let the Downloads watch file it
async function fetchFreePdf(it, hit) {
  if (hit.pdf) {
    try {
      const r = await fetch(hit.url, { redirect: "follow" });
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.length > 1000 && String.fromCharCode(...buf.slice(0, 5)) === "%PDF-") {
          const name = await window.citekeepApp.placePdf(PDF.folder, pdfNameFor(it), null, buf);
          await adoptFiled(it, name);
          return "saved";
        }
      }
    } catch (e) { /* the site blocks downloads by other programs */ }
  }
  markSearched(it);
  await window.citekeepApp.openLink(hit.url);
  return "opened";
}
async function adoptFiled(it, name) {
  const f = { path: name, name, key: " " + fileKey(name) + " " };
  if (!PDF.files.some(x => x.path === name)) PDF.files.push(f);
  await linkFile(items.find(x => x.id === it.id) || it, f);
  GET.filed.unshift({ name, ref: citeForms(it).narrative, at: Date.now() });
  GET.filed = GET.filed.slice(0, 12);
  if (canReadPdfs()) indexPdfs().catch(() => {});
}
async function freeForOne(it, btn) {
  if (!PDF.folder) { toast("Choose your PDF folder in Settings first."); return; }
  const email = await unpaywallEmail(); if (!email) return;
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  try {
    const hit = await unpaywall(it.doi, email);
    if (!hit) { toast("No free legal copy on record. Try Search for PDF."); return; }
    const how = await fetchFreePdf(it, hit);
    if (how === "saved") toast(`Saved a free copy from ${hit.host} and linked it`);
    else toast(`Opened the free copy from ${hit.host} in your browser. Download it there and Citekeep will file it.`);
    renderDetail(); renderList(); renderPdfCard();
  } catch (e) { toast("Couldn't reach Unpaywall. Try again in a minute."); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = "Free PDF"; } }
}
function searchForPdf(it) {
  const q = `"${(it.title || "").replace(/"/g, "")}" pdf`;
  markSearched(it);
  window.citekeepApp.openLink("https://www.google.com/search?q=" + encodeURIComponent(q));
  toast(GET.timer ? "Searching in your browser. When you download the PDF, Citekeep files and links it." : "Searching in your browser.");
}
function afterCopyRow(it, row) {
  if (it.file) return;
  const b = document.createElement("span"); b.className = "row"; b.style.gap = "6px";
  b.innerHTML = `${it.doi ? `<button class="btn" id="freePdf">Free PDF</button>` : ""}<button class="btn" id="searchPdf">Search for PDF</button>`;
  row.appendChild(b);
  const fp = $("#freePdf"); if (fp) fp.onclick = () => freeForOne(it, fp);
  $("#searchPdf").onclick = () => searchForPdf(it);
}

// ---------- the Downloads watch ----------
function watchOn() { const s = PDF.settings || {}; return s.watchDownloads !== "off" && !!PDF.folder; }
async function startDownloadsWatch() {
  if (!window.citekeepApp.listPdfs) return;
  GET.dl = await window.citekeepApp.downloadsDir();
  if (!GET.dl) return;
  for (const f of await window.citekeepApp.listPdfs(GET.dl)) GET.seen.set(f.name, f.size + ":" + f.mtime);
  if (GET.timer) clearInterval(GET.timer);
  GET.timer = setInterval(pollDownloads, 4000);
  renderPdfCard();
}
async function pollDownloads() {
  if (!watchOn() || GET.busy) return;
  GET.busy = true;
  try {
    const now = await window.citekeepApp.listPdfs(GET.dl);
    for (const f of now) {
      const sig = f.size + ":" + f.mtime;
      if (GET.seen.get(f.name) === sig) continue;
      // wait until the file stops growing (the browser is still writing it)
      if (GET.pending.get(f.name) !== sig) { GET.pending.set(f.name, sig); continue; }
      GET.pending.delete(f.name); GET.seen.set(f.name, sig);
      if (f.size < 1000) continue;
      await fileDownload(f.name, false);
    }
  } catch (e) {} finally { GET.busy = false; }
}
// read a PDF in Downloads, find its reference, move it into the PDF folder and link it
async function fileDownload(name, backlog) {
  let e;
  try { e = await readOnePdf({ path: name }, GET.dl); } catch (x) { e = { error: true }; }
  const f = { path: "dl:" + name, name, key: " " + fileKey(name) + " ", _info: e };
  const L = libDoiSet();
  const scored = [];
  for (const it of items) {
    if (it.file) continue;
    const m = matchScore(it, f, L);
    const searched = recentlySearched(it.id) && !backlog;
    if (accepted(m) || (searched && m.s >= 40)) scored.push([m.how === "doi" ? 300 : m.s + (searched ? 30 : 0), it, m]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const best = scored[0];
  if (!best && e && e.c && (PDF.settings || {}).addFromDownloads !== "off" && typeof addFromPdfBytes === "function") {
    // not in the library yet: if the PDF identifies itself (its DOI, or its title confirmed by Crossref), add it as a new reference
    try {
      const bytes = new Uint8Array(await window.citekeepApp.readPdf(GET.dl, name));
      const r = await addFromPdfBytes(bytes, name, true);
      if (r.added || r.linked) { GET.seen.delete(name); if (!backlog) { toast(`${r.added ? "Added a new reference" : "Linked"}: ${citeForms(r.item).narrative}`); renderAll(); } return { it: r.item, placed: r.name }; }
    } catch (x) {}
  }
  if (!best || (scored[1] && best[2].how !== "doi" && best[0] - scored[1][0] < 10)) {
    if (!backlog) { GET.unfiled.unshift(name); GET.unfiled = GET.unfiled.slice(0, 12); renderPdfCard(); }
    return null;
  }
  const it = best[1];
  let placed;
  try { placed = await window.citekeepApp.placePdf(PDF.folder, pdfNameFor(it), { folder: GET.dl, name }); }
  catch (x) { if (!backlog) toast(`Couldn't move “${name}” into your PDF folder.`); return null; }
  GET.seen.delete(name);
  await adoptFiled(it, placed);
  if (!backlog) { toast(`Filed and linked: ${citeForms(it).narrative}`); renderDetail(); renderList(); renderPdfCard(); }
  return { it, placed };
}
async function checkDownloadsNow(btn) {
  if (!PDF.folder) { toast("Choose your PDF folder first."); return; }
  btn.disabled = true;
  const all = await window.citekeepApp.listPdfs(GET.dl);
  let n = 0, done = 0; const got = [];
  for (const f of all) {
    btn.textContent = `Checking ${++done} of ${all.length}…`;
    const r = await fileDownload(f.name, true);
    if (r) { n++; got.push(citeForms(r.it).narrative); }
  }
  btn.disabled = false; btn.textContent = "Check Downloads now";
  toast(n ? `Filed and linked ${n} PDF${n === 1 ? "" : "s"} from Downloads` : "Nothing in Downloads matched a reference without a PDF");
  renderDetail(); renderList(); renderPdfCard();
}

// ---------- free copies for everything that has no PDF ----------
async function findFreeAll(btn) {
  if (!PDF.folder) { toast("Choose your PDF folder first."); return; }
  const email = await unpaywallEmail(); if (!email) return;
  const todo = items.filter(i => !i.file && i.doi);
  btn.disabled = true;
  const found = []; let done = 0, failed = 0;
  const q = todo.slice();
  const work = async () => { while (q.length) { const it = q.shift(); try { const h = await unpaywall(it.doi, email); if (h) found.push({ it, h }); } catch (e) { failed++; } done++; btn.textContent = `Checking ${done} of ${todo.length}…`; } };
  await Promise.all([work(), work(), work(), work()]);
  // save the ones whose sites allow it straight into the folder
  let saved = 0; const open = [];
  for (const x of found) {
    btn.textContent = `Saving ${saved + open.length + 1} of ${found.length}…`;
    if (x.h.pdf) {
      try {
        const r = await fetch(x.h.url, { redirect: "follow" });
        if (r.ok) { const buf = new Uint8Array(await r.arrayBuffer()); if (buf.length > 1000 && String.fromCharCode(...buf.slice(0, 5)) === "%PDF-") { const name = await window.citekeepApp.placePdf(PDF.folder, pdfNameFor(x.it), null, buf); await adoptFiled(x.it, name); saved++; continue; } }
      } catch (e) {}
    }
    open.push(x);
  }
  GET.free = { checked: todo.length, saved, open, none: todo.length - found.length - failed, failed };
  btn.disabled = false; btn.textContent = "Find free PDFs";
  toast(`Saved ${saved} free PDF${saved === 1 ? "" : "s"}` + (open.length ? `; ${open.length} more can be opened in your browser` : ""));
  renderDetail(); renderList(); renderPdfCard();
}

// ---------- the PDF card section ----------
function afterPdfCard(c) {
  if (!PDF.folder) return;
  const s = PDF.settings || {};
  const missing = items.filter(i => !i.file), withDoi = missing.filter(i => i.doi);
  const F = GET.free;
  c.insertAdjacentHTML("beforeend", `<div style="border-top:1px solid var(--line);padding-top:10px;display:grid;gap:8px">
    <h3 style="margin:0">Getting PDFs</h3>
    <p class="note" style="margin:0">For references without a PDF: Citekeep can look for a free, legal copy through Unpaywall, or open a search for the title in your browser. PDFs you download are filed into “${esc(PDF.name)}” and linked for you.</p>
    <div class="row"><button class="btn" id="freeAll" ${withDoi.length ? "" : "disabled"}>Find free PDFs</button><span class="note">${withDoi.length} of the ${missing.length} references without a PDF have a DOI to check</span></div>
    ${F ? `<div class="note">Checked ${F.checked}: saved ${F.saved}${F.open.length ? `, ${F.open.length} more on sites that need your browser` : ""}, ${F.none} with no free copy on record${F.failed ? `, ${F.failed} not answered` : ""}.</div>
      ${F.open.length ? `<details><summary class="note" style="cursor:pointer">Open in your browser (${F.open.length})</summary><ul class="stylist">${F.open.map((x, i) => `<li>${esc(citeForms(x.it).parenthetical)} ${esc((x.it.title || "").slice(0, 60))} <button class="copy" data-openfree="${i}">Open</button> <span class="note">${esc(x.h.host)}</span></li>`).join("")}</ul></details>` : ""}` : ""}
    <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="watchDl" ${watchOn() ? "checked" : ""}>Watch my Downloads folder and file PDFs that match a reference</label>
    <label class="note" style="display:flex;gap:6px;align-items:center;margin-left:22px"><input type="checkbox" id="addDl" ${s.addFromDownloads !== "off" ? "checked" : ""}>Also add new references for downloaded articles not in my library yet</label>
    <div class="row"><button class="btn" id="checkDl" ${GET.dl ? "" : "disabled"}>Check Downloads now</button><span class="note">for PDFs downloaded while Citekeep was closed</span></div>
    ${GET.filed.length ? `<details open><summary class="note" style="cursor:pointer">Recently filed (${GET.filed.length})</summary><ul class="stylist">${GET.filed.map(x => `<li>${esc(x.ref)} → ${esc(x.name)}</li>`).join("")}</ul></details>` : ""}
    ${GET.unfiled.length ? `<details><summary class="note" style="cursor:pointer">Downloads that didn't match a reference (${GET.unfiled.length})</summary><ul class="stylist">${GET.unfiled.map(n => `<li>${esc(n)}</li>`).join("")}</ul><p class="note">These stay in Downloads. To link one, move it into your PDF folder and use Find my copy on the reference.</p></details>` : ""}
  </div>`);
  const fa = c.querySelector("#freeAll"); if (fa) fa.onclick = () => findFreeAll(fa);
  c.querySelectorAll("[data-openfree]").forEach(b => b.onclick = () => { const x = GET.free.open[+b.dataset.openfree]; markSearched(x.it); window.citekeepApp.openLink(x.h.url); b.textContent = "Opened"; });
  c.querySelector("#watchDl").onchange = async e => { s.watchDownloads = e.target.checked ? "" : "off"; await window.citekeepApp.setSetting("watchDownloads", e.target.checked ? "" : "off"); toast(e.target.checked ? "Watching Downloads" : "Stopped watching Downloads"); };
  c.querySelector("#addDl").onchange = async e => { s.addFromDownloads = e.target.checked ? "" : "off"; await window.citekeepApp.setSetting("addFromDownloads", e.target.checked ? "" : "off"); };
  const cd = c.querySelector("#checkDl"); if (cd) cd.onclick = () => checkDownloadsNow(cd);
}
