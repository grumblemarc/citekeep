// ===== Your Citekeep data: where it lives, daily backups, and moving to a new computer =====
var DATA = { info: null, backups: [], other: null, beat: null };
const SECRET_KEYS = ["claudeKey", "gRefresh", "gClientSecret"];

async function dataStartup() {
  if (!window.citekeepApp || !window.citekeepApp.dataInfo) return;
  try { DATA.info = await window.citekeepApp.dataInfo(); } catch (e) { return; }
  try { DATA.backups = await window.citekeepApp.dailyBackup(); } catch (e) {}
  if (DATA.info.elsewhere || DATA.info.missing) {
    try { DATA.other = await window.citekeepApp.heartbeat(false); } catch (e) {}
    if (DATA.other) showBanner(`Citekeep looks open on ${DATA.other}, which shares this library. Close it there before making changes here, or the two copies will overwrite each other.`);
    DATA.beat = setInterval(async () => { try { DATA.other = await window.citekeepApp.heartbeat(false); } catch (e) {} }, 60 * 1000);
  }
  if (DATA.info.missing) showBanner(`Your shared Citekeep folder (${DATA.info.missing}) isn't available, so Citekeep is using Documents\\Citekeep on this computer for now. If it's in Google Drive or OneDrive, make sure that app is running, then restart Citekeep.`);
  try { UPD.current = parseInt(await window.citekeepApp.appVersion(), 10) || 0; } catch (e) {}
  renderDataCard();
  // check for a new version once a day, quietly
  try { const st = await window.citekeepApp.readSettingsRaw(); if (!st.lastUpdateCheck || Date.now() - +st.lastUpdateCheck > 20 * 3600 * 1000) setTimeout(() => checkUpdates(true), 4000); } catch (e) {}
}
function showBanner(msg) { const b = document.getElementById("memBanner"); if (b) { b.textContent = msg; b.hidden = false; } }

function renderDataCard() {
  let c = document.getElementById("dataCard");
  if (!c) { const io = document.querySelector("#settingsCols") || document.querySelector("#tab-io .cols"); if (!io) return; c = document.createElement("div"); c.className = "card"; c.id = "dataCard"; io.appendChild(c); }
  const I = DATA.info || {};
  c.innerHTML = `<h3 style="margin:0">Your Citekeep data</h3>
    <p class="note" style="margin:0">Your library, settings and PDF index are kept in <b>${esc(I.dir || "Documents\\Citekeep")}</b>${I.elsewhere ? " (a shared folder)" : ""}.</p>
    <details><summary class="note" style="cursor:pointer">Share one library between computers</summary>
      <p class="note">Put your Citekeep folder inside Google Drive, OneDrive or Dropbox, then choose the same folder on your other computer. Both computers then use one library. Have Citekeep open on only one computer at a time.</p>
      <div class="row"><button class="btn" id="dataMove">Choose a shared folder…</button>${I.elsewhere ? `<button class="copy" id="dataBack">Go back to Documents\\Citekeep</button>` : ""}</div>
    </details>
    <details><summary class="note" style="cursor:pointer">Daily backups (${DATA.backups.length})</summary>
      <p class="note">Each day you open Citekeep, a copy of your library is saved in the backups folder. The last 10 days are kept.</p>
      ${DATA.backups.length ? `<ul class="stylist">${DATA.backups.map(n => `<li>${esc(n.replace(/^library-|\.json$/g, ""))} <button class="copy" data-restore="${esc(n)}">Restore</button></li>`).join("")}</ul>` : ""}
    </details>
    <details><summary class="note" style="cursor:pointer">Moving to a new computer</summary>
      <ol class="stylist" style="padding-left:20px">
        <li>On this computer, click <b>Export transfer file</b>. Tick “Include my PDFs” unless they're already in Google Drive, OneDrive or Dropbox.</li>
        <li>Copy the file to the new computer (a USB drive, email, or cloud folder).</li>
        <li>On the new computer, install Citekeep, choose <b>Start a new, empty library</b> if asked, then click <b>Import transfer file</b> and choose the file.</li>
        <li>Check the Your PDFs card. Citekeep looks for your PDF folder by name; if it can't find it, choose it once.</li>
        <li>If you use LM Studio, install it on the new computer, load your model, and click Test connection in Settings → AI drafting.</li>
      </ol>
    </details>
    <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="xPdfs">Include my PDFs (${typeof PDF !== "undefined" && PDF && PDF.files ? PDF.files.length : 0} files)</label>
    <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="xSecrets">Include my Claude API key and Google sign-in</label>
    <div class="row" style="align-items:center"><span class="note" id="updNote">Citekeep ${esc(UPD.current ? "V" + UPD.current : "")}${UPD.latest ? (UPD.latest.version > UPD.current ? ` · <b>V${UPD.latest.version} is available</b>` : " · up to date") : ""}</span>${UPD.latest && UPD.latest.version > UPD.current && UPD.latest.asset ? `<button class="btn primary" id="updGo">Update to V${UPD.latest.version}</button>` : `<button class="copy" id="updCheck">Check for updates</button>`}</div>
    <p class="note" style="margin:0">Citekeep is free software under the MIT License, provided as is, without warranty or support. It is built with Neutralinojs, PDF.js and JSZip; their licenses are in THIRD-PARTY-NOTICES.txt in the Citekeep program folder.</p>
    <div class="row"><button class="btn primary" id="dataExport">Export transfer file</button><label class="btn" for="dataImportIn">Import transfer file</label><input type="file" id="dataImportIn" accept=".zip" hidden><span class="note" id="dataNote"></span></div>`;
  $("#dataMove").onclick = moveDataFolder;
  const db = $("#dataBack"); if (db) db.onclick = async () => { const a = DATA.info.anchor; if (!confirm(`Use ${a} on this computer again? Your current library is copied there first.`)) return; await window.citekeepApp.setDataDir(a, "copy"); location.reload(); };
  c.querySelectorAll("[data-restore]").forEach(b => b.onclick = async () => {
    const n = b.dataset.restore;
    if (!confirm(`Replace your library with the backup from ${n.replace(/^library-|\.json$/g, "")}? Your current library is kept as library-previous.json.`)) return;
    if (window.citekeepFlush) await window.citekeepFlush();
    if (await window.citekeepApp.restoreBackup(n)) location.reload(); else toast("Couldn't restore that backup.");
  });
  $("#dataExport").onclick = exportTransfer;
  const uc = $("#updCheck"); if (uc) uc.onclick = () => checkUpdates(false);
  const ug = $("#updGo"); if (ug) ug.onclick = runUpdate;
  $("#dataImportIn").onchange = e => { const f = e.target.files[0]; if (f) importTransfer(f); e.target.value = ""; };
}

// ---------- updates ----------
var UPD = { current: 0, latest: null, busy: false };
async function checkUpdates(quiet) {
  if (!window.citekeepApp.updateCheck || UPD.busy) return;
  UPD.busy = true;
  try {
    UPD.current = parseInt(await window.citekeepApp.appVersion(), 10) || UPD.current;
    const r = await window.citekeepApp.updateCheck();
    if (!r.ok) { if (!quiet) toast(r.error); return; }
    UPD.latest = r;
    try { await window.citekeepApp.setSetting("lastUpdateCheck", String(Date.now())); } catch (e) {}
    if (r.version > UPD.current) { if (quiet) showBanner(`Citekeep V${r.version} is available. Update it in Settings → Your Citekeep data.`); else toast(`V${r.version} is available`); }
    else if (!quiet) toast(r.version < UPD.current ? `You have V${UPD.current}, newer than the latest release (V${r.version}).` : "Citekeep is up to date");
  } catch (e) { if (!quiet) toast("Couldn't check for updates."); }
  finally { UPD.busy = false; renderDataCard(); }
}
async function runUpdate() {
  const L = UPD.latest; if (!L || !L.asset) return;
  // never replace a newer version with an older one
  if (!(L.version > UPD.current)) { toast("You already have this version or a newer one."); return; }
  const b = $("#updGo"); b.disabled = true; b.textContent = "Downloading…";
  const d = await window.citekeepApp.updateDownload(L.asset.url, L.asset.name);
  if (!d.ok) { toast(d.error); b.disabled = false; b.textContent = `Update to V${L.version}`; return; }
  if (!confirm(`V${L.version} is downloaded. Citekeep will save your library, close, and run the installer. Continue?`)) { b.disabled = false; b.textContent = `Update to V${L.version}`; toast("The installer is in your Downloads folder."); return; }
  b.textContent = "Starting the installer…";
  await window.citekeepApp.updateRun(d.path);
}

async function moveDataFolder() {
  const parent = await window.citekeepApp.pickAnyFolder("Choose where your Citekeep folder should live (for example, inside Google Drive)");
  if (!parent) return;
  const chk = await window.citekeepApp.setDataDir(parent, "check");
  if (window.citekeepFlush) await window.citekeepFlush();
  if (chk.has) {
    const keep = confirm(`${chk.target} already has a Citekeep library (probably from your other computer).\n\nOK: use that library on this computer.\nCancel: replace it with the library on this computer.`);
    if (keep) { await window.citekeepApp.setDataDir(parent, "use"); location.reload(); return; }
    if (!confirm(`Replace the library in ${chk.target} with this computer's library? The one there is kept in its backups folder only if it was backed up today.`)) return;
  }
  await window.citekeepApp.setDataDir(parent, "copy");
  location.reload();
}

function dateStamp() { return new Date().toISOString().slice(0, 10); }
async function exportTransfer() {
  const note = $("#dataNote"), btn = $("#dataExport");
  btn.disabled = true;
  try {
    if (window.citekeepFlush) await window.citekeepFlush();
    const zip = new JSZip();
    const settings = Object.assign({}, await window.citekeepApp.readSettingsRaw());
    if (!$("#xSecrets").checked) for (const k of SECRET_KEYS) delete settings[k];
    delete settings.libraryChoice;
    const lib = await window.citekeepApp.readText("library.json");
    zip.file("library.json", lib || "[]");
    zip.file("settings.json", JSON.stringify(settings, null, 1));
    const idx = await window.citekeepApp.readText("pdf-index.json"); if (idx) zip.file("pdf-index.json", idx);
    let n = 0;
    const withPdfs = $("#xPdfs").checked && PDF && PDF.folder;
    if (withPdfs) {
      for (const f of PDF.files) {
        note.textContent = `Adding PDF ${++n} of ${PDF.files.length}…`;
        try { const buf = await window.citekeepApp.readPdf(PDF.folder, f.path); zip.file("PDFs/" + f.path.replace(/\\/g, "/"), buf, { binary: true, compression: "STORE" }); } catch (e) {}
      }
    }
    const items0 = (() => { try { return JSON.parse(lib || "[]").length; } catch (e) { return 0; } })();
    zip.file("manifest.json", JSON.stringify({ citekeepTransfer: 1, created: new Date().toISOString(), from: DATA.info && DATA.info.computer, references: items0, pdfFolderName: PDF && PDF.folder ? PDF.folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : "", pdfs: withPdfs ? n : 0 }, null, 1));
    note.textContent = "Packing the file…";
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    note.textContent = "";
    await downloads.save({ filename: `Citekeep Transfer ${dateStamp()}.zip`, data: blob });
    toast(`Exported ${items0} references${withPdfs ? ` and ${n} PDFs` : ""}`);
  } catch (e) { if (e.code !== "declined") toast("Couldn't create the transfer file."); note.textContent = ""; }
  btn.disabled = false;
}

async function importTransfer(file) {
  const note = $("#dataNote");
  let zip, man;
  try { zip = await JSZip.loadAsync(file); man = JSON.parse(await zip.file("manifest.json").async("string")); if (!man.citekeepTransfer) throw 0; }
  catch (e) { toast("That isn't a Citekeep transfer file."); return; }
  const when = (man.created || "").slice(0, 10);
  if (!confirm(`Import ${man.references} references${man.pdfs ? ` and ${man.pdfs} PDFs` : ""} exported${man.from ? " on " + man.from : ""}${when ? " (" + when + ")" : ""}?` + (items.length ? `\n\nThe ${items.length} references now in Citekeep on this computer are kept as a backup file, then replaced.` : ""))) return;
  try {
    if (items.length) await window.citekeepApp.archiveLibrary();
    await window.citekeepApp.saveLibrary(await zip.file("library.json").async("string"));
    const cur = await window.citekeepApp.readSettingsRaw();
    const inc = JSON.parse(await zip.file("settings.json").async("string"));
    const merged = Object.assign({}, inc);
    for (const k of SECRET_KEYS) if (!(k in inc) && cur[k]) merged[k] = cur[k];
    merged.libraryChoice = "keep";
    const ix = zip.file("pdf-index.json");
    if (man.pdfs) {
      const docs = await window.citekeepApp.documentsDir();
      let dest = docs.replace(/[\\/]+$/, "") + (docs.includes("\\") ? "\\" : "/") + (man.pdfFolderName || "Citekeep PDFs");
      if (!confirm(`Put your ${man.pdfs} PDFs in ${dest}?\n\nCancel to choose a different folder.`)) { const pick = await window.citekeepApp.pickAnyFolder("Choose where your PDF folder should go"); if (!pick) return; dest = pick.replace(/[\\/]+$/, "") + (pick.includes("\\") ? "\\" : "/") + (man.pdfFolderName || "Citekeep PDFs"); }
      await window.citekeepApp.makeDir(dest);
      const files = Object.keys(zip.files).filter(k => k.startsWith("PDFs/") && !zip.files[k].dir);
      let n = 0;
      for (const k of files) { note.textContent = `Copying PDF ${++n} of ${files.length}…`; await window.citekeepApp.writeBinaryAt(dest, k.slice(5), await zip.file(k).async("uint8array")); }
      merged.pdfFolder = dest;
    }
    await window.citekeepApp.writeSettingsRaw(merged);
    if (man.pdfs) await window.citekeepApp.setSetting("pdfFolder", merged.pdfFolder); // stored as ~\… when it is inside your user folder
    if (ix) await window.citekeepApp.writeText("pdf-index.json", await ix.async("string"));
    note.textContent = "Done. Restarting…";
    setTimeout(() => location.reload(), 600);
  } catch (e) { note.textContent = ""; toast("The import didn't finish. Your earlier library is in Documents\\Citekeep as a backup file."); }
}

(function () {
  const go = () => setTimeout(dataStartup, 300);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
