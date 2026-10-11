// ===== Save a list of one Google Drive folder (and its subfolders) as a .txt file =====
const GFOLDER = "application/vnd.google-apps.folder";
const GTYPES = { "application/pdf": "PDF", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word", "application/msword": "Word", "application/vnd.google-apps.document": "Google Doc", "application/vnd.google-apps.spreadsheet": "Google Sheet", "application/vnd.google-apps.presentation": "Google Slides", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint", "text/plain": "Text", "image/jpeg": "Image", "image/png": "Image", "application/zip": "Zip" };
const gEsc = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function gCall(path, params) {
  const r = await window.citekeepApp.googleDrive(path, params);
  if (!r.ok) throw new Error(r.error === "NOT_SIGNED_IN" ? "Google sign-in has expired. Sign in to Google Drive again." : r.error);
  return r.data;
}
async function gList(q, fields) {
  const out = []; let pageToken = "";
  for (let i = 0; i < 100; i++) {
    const params = { q, fields: "nextPageToken, files(" + fields + ")", pageSize: "1000", includeItemsFromAllDrives: "true", supportsAllDrives: "true", orderBy: "folder,name" };
    if (pageToken) params.pageToken = pageToken;
    const j = await gCall("files", params);
    out.push(...(j.files || []));
    if (!j.nextPageToken) break; pageToken = j.nextPageToken;
  }
  return out;
}
const gNames = new Map();
async function gPath(id) {
  const parts = [];
  for (let i = 0; i < 20 && id; i++) {
    let f = gNames.get(id);
    if (!f) { try { f = await gCall("files/" + id, { fields: "id,name,parents", supportsAllDrives: "true" }); } catch (e) { break; } gNames.set(id, f); }
    parts.unshift(f.name); id = f.parents && f.parents[0];
  }
  return parts.join("/");
}
function gSize(n) { n = +n || 0; return !n ? "" : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
async function driveFolderText(folder, onProgress) {
  const linked = new Map(); for (const it of items) if (it.file && String(it.file).startsWith("drive:")) linked.set(it.file.slice(6), citeForms(it).parenthetical);
  const lines = [], counts = { files: 0, pdfs: 0, folders: 0, linked: 0 };
  async function walk(id, path, depth) {
    if (onProgress) onProgress(path);
    const kids = await gList(`'${id}' in parents and trashed=false`, "id,name,mimeType,size,modifiedTime,webViewLink");
    const subs = kids.filter(k => k.mimeType === GFOLDER), files = kids.filter(k => k.mimeType !== GFOLDER);
    lines.push("", (depth ? "" : "") + path + "/" + `  (${files.length} file${files.length === 1 ? "" : "s"}${subs.length ? `, ${subs.length} folder${subs.length === 1 ? "" : "s"}` : ""})`);
    for (const f of files) {
      counts.files++; if (f.mimeType === "application/pdf") counts.pdfs++;
      const cite = linked.get(f.id); if (cite) counts.linked++;
      lines.push(`    ${f.name}  |  ${GTYPES[f.mimeType] || (f.mimeType || "").split("/").pop()}${f.size ? "  |  " + gSize(f.size) : ""}  |  ${String(f.modifiedTime || "").slice(0, 10)}${cite ? "  |  linked in Citekeep: " + cite : ""}`);
      lines.push(`        ${f.webViewLink || ""}`);
    }
    for (const s of subs) { counts.folders++; await walk(s.id, path + "/" + s.name, depth + 1); }
  }
  const top = await gPath(folder.id);
  await walk(folder.id, top || folder.name, 0);
  const head = [`Google Drive folder: ${top || folder.name}`, `Listed by Citekeep on ${new Date().toISOString().slice(0, 10)}`, `${counts.files} files (${counts.pdfs} PDFs, ${counts.linked} linked to references in Citekeep) in ${counts.folders + 1} folder${counts.folders ? "s" : ""}`, "Each file: name | type | size | last modified | link"];
  return head.join("\r\n") + "\r\n" + lines.join("\r\n") + "\r\n";
}
function bindDriveList(c) {
  const b = c.querySelector("#gList"); if (!b) return;
  b.onclick = () => {
    if (c.querySelector("#gListBox")) return;
    b.insertAdjacentHTML("afterend", `<div id="gListBox" style="display:grid;gap:6px;width:100%"><span class="note">Type part of the folder's name, as it appears in Google Drive.</span><div class="row" style="flex-wrap:nowrap"><input type="search" id="gListQ" placeholder="Folder name, e.g. 50"><button class="btn" id="gListFind">Find</button><button class="copy" id="gListCancel">Cancel</button></div><div id="gListRes"></div></div>`);
    const q = c.querySelector("#gListQ"), res = c.querySelector("#gListRes");
    c.querySelector("#gListCancel").onclick = () => c.querySelector("#gListBox").remove();
    const find = async () => {
      const name = q.value.trim(); if (!name) return;
      res.innerHTML = `<span class="note">Looking…</span>`;
      try {
        const found = await gList(`mimeType='${GFOLDER}' and trashed=false and name contains '${gEsc(name)}'`, "id,name,parents");
        if (!found.length) { res.innerHTML = `<span class="note">No folder with “${esc(name)}” in its name.</span>`; return; }
        const withPaths = []; for (const f of found.slice(0, 15)) withPaths.push([f, await gPath(f.id)]);
        res.innerHTML = withPaths.map(([f, p], i) => `<button class="item" data-gf="${i}" style="border:1px solid var(--line);border-radius:6px;margin-bottom:4px"><div class="ttl" style="font-size:13.5px">${esc(f.name)}</div><div class="note">${esc(p)}</div></button>`).join("") + (found.length > 15 ? `<span class="note">Showing 15 of ${found.length}; type more of the name.</span>` : "");
        res.querySelectorAll("[data-gf]").forEach(el => el.onclick = async () => {
          const [f] = withPaths[+el.dataset.gf];
          res.innerHTML = `<span class="note" id="gListProg">Listing “${esc(f.name)}”…</span>`;
          try {
            const txt = await driveFolderText(f, p => { const n = document.getElementById("gListProg"); if (n) n.textContent = "Listing " + p + "…"; });
            await downloads.save({ filename: `Drive folder - ${f.name.replace(/[\\/:*?"<>|]+/g, " ")} - ${new Date().toISOString().slice(0, 10)}.txt`, data: new Blob([txt], { type: "text/plain" }) });
            const n = document.getElementById("gListBox"); if (n) n.remove();
            toast("Saved the folder list");
          } catch (e) { if (e.code !== "declined") res.innerHTML = `<span class="note">${esc(e.message || "Couldn't list that folder.")}</span>`; }
        });
      } catch (e) { res.innerHTML = `<span class="note">${esc(e.message)}</span>`; }
    };
    c.querySelector("#gListFind").onclick = find;
    q.onkeydown = e => { if (e.key === "Enter") find(); };
    q.focus();
  };
}
