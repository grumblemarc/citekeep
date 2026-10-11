// ===== Citekeep portable (Neutralino): the same app bridge the installed version uses =====
(function () {
  // GitHub repository whose releases Citekeep checks for updates. A fork should change this to its own "owner/repo".
  const UPDATE_REPO = "grumblemarc/citekeep";
  // Always get this launch's access token straight from the engine, never from a cached copy
  async function freshGlobals() {
    try {
      const r = await fetch("/__neutralino_globals.js?_=" + Date.now(), { cache: "no-store" });
      let t = r.ok ? await r.text() : "";
      if (!/NL_TOKEN\s*=/.test(t)) { const r2 = await fetch("/__neutralino_globals.js", { cache: "no-store" }); t = r2.ok ? await r2.text() : ""; }
      if (/NL_TOKEN\s*=\s*['"][^'"]+['"]/.test(t)) (0, eval)(t);
    } catch (e) {}
    try { if (window.NL_TOKEN) sessionStorage.setItem("NL_TOKEN", window.NL_TOKEN); else sessionStorage.removeItem("NL_TOKEN"); } catch (e) {}
  }
  function warnUser(msg) {
    const show = () => { const b = document.getElementById("memBanner"); if (b) { b.textContent = msg; b.hidden = false; } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
  }
  const fromTemp = () => /[\\/](Temp|tmp)[\\/]/i.test(String(window.NL_PATH || "") + String(window.NL_CWD || ""));
  let engineReady = false;
  const ready = new Promise(res => {
    freshGlobals().then(() => {
      if (fromTemp()) warnUser("Citekeep is running from inside the zip file, so it can't work properly. Close it, right-click the zip, choose Extract All, and run Citekeep.exe from the extracted folder.");
      try { Neutralino.init(); Neutralino.events.on("ready", () => { engineReady = true; res(); }); } catch (e) { res(); }
      setTimeout(() => {
        if (!engineReady) warnUser("Citekeep couldn't connect to its engine. If you opened it from inside the zip file, close it, extract the zip (right-click, Extract All), and run Citekeep.exe from the extracted folder. Otherwise, close every Citekeep window and open it again.");
        res();
      }, 8000);
    });
  });
  const isWin = () => (window.NL_OS || "").toLowerCase().startsWith("win");
  const SEP = () => (isWin() ? "\\" : "/");
  const join = (...p) => p.filter(Boolean).join(SEP()).replace(/[\\/]+/g, SEP());
  let compName = null;
  async function computerName() { if (compName === null) { try { compName = await Neutralino.os.getEnv(isWin() ? "COMPUTERNAME" : "HOSTNAME"); } catch { compName = ""; } compName = compName || "this computer"; } return compName; }
  const q = s => '"' + String(s).replace(/"/g, '\\"') + '"';
  const psq = s => "'" + String(s).replace(/'/g, "''") + "'";
  // Documents\Citekeep is the anchor. It holds the data, or a location.json pointing to a Citekeep folder elsewhere
  // (for example inside Google Drive or OneDrive, so several computers share one library).
  let docsDir = null, anchorDir = null, homeDir = null, dataMoved = "";
  async function home() {
    if (homeDir === null) { try { homeDir = await Neutralino.os.getEnv(isWin() ? "USERPROFILE" : "HOME"); } catch { homeDir = ""; } if (!homeDir) { try { homeDir = (await Neutralino.os.getPath("documents")).replace(/[\\/][^\\/]+[\\/]?$/, ""); } catch { homeDir = ""; } } }
    return homeDir;
  }
  // paths inside the user's own folder are stored as ~\…, so they work for any user name on any computer
  async function toPortable(p) { const h = await home(); if (!p || !h) return p || ""; const a = p.replace(/[\\/]+$/, ""), hh = h.replace(/[\\/]+$/, ""); return a.toLowerCase().startsWith(hh.toLowerCase() + SEP()) || a.toLowerCase().startsWith(hh.toLowerCase() + "/") ? "~" + a.slice(hh.length) : a; }
  async function fromPortable(p) { if (!p) return ""; if (p[0] !== "~") return p; return join(await home(), p.slice(1)); }
  async function exists(p) { try { await Neutralino.filesystem.getStats(p); return true; } catch { return false; } }
  async function anchor() {
    if (!anchorDir) { anchorDir = join(await Neutralino.os.getPath("documents"), "Citekeep"); try { await Neutralino.filesystem.createDirectory(anchorDir); } catch {} }
    return anchorDir;
  }
  async function dir() {
    await ready;
    if (!docsDir) {
      const a = await anchor();
      docsDir = a;
      try {
        const loc = JSON.parse(await Neutralino.filesystem.readFile(join(a, "location.json")));
        const where = await fromPortable(loc.dataDir || "");
        if (where && await exists(where)) docsDir = where; else if (where) dataMoved = where;
      } catch {}
    }
    return docsDir;
  }
  // settings live in Documents\Citekeep\settings.json beside the library, so every version and install finds them;
  // older versions kept them in the app's own storage folder, so bring those over the first time
  let sCache = null;
  async function getS() {
    if (sCache) return Object.assign({}, sCache);
    const d = await dir(), f = join(d, "settings.json");
    try { sCache = JSON.parse(await Neutralino.filesystem.readFile(f)) || {}; }
    catch {
      sCache = {};
      try { sCache = JSON.parse(await Neutralino.storage.getData("settings")) || {}; } catch {}
      try { await Neutralino.filesystem.writeFile(f, JSON.stringify(sCache, null, 1)); } catch {}
    }
    return Object.assign({}, sCache);
  }
  async function putS(s) { const d = await dir(); sCache = Object.assign({}, s); await Neutralino.filesystem.writeFile(join(d, "settings.json"), JSON.stringify(s, null, 1)); }
  async function setOne(k, v) { const s = await getS(); if (v === null || v === undefined || v === "") delete s[k]; else s[k] = v; await putS(s); }
  const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const REDIRECT = () => "http://127.0.0.1:" + (window.NL_PORT || location.port) + "/oauth.html";
  async function tokenRequest(body) {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || ("Google answered " + r.status));
    return j;
  }
  let pendingSignIn = null;
  let token = null; // {token, exp}
  async function refreshToken() {
    const s = await getS();
    if (!s.gRefresh || !s.gClientId) throw new Error("NOT_SIGNED_IN");
    const body = { client_id: s.gClientId, refresh_token: s.gRefresh, grant_type: "refresh_token" };
    if (s.gClientSecret) body.client_secret = s.gClientSecret;
    let j;
    try { j = await tokenRequest(body); } catch (e) { await setOne("gRefresh", null); throw new Error("NOT_SIGNED_IN"); }
    token = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
    return token.token;
  }
  async function accessToken() { if (token && Date.now() < token.exp) return token.token; return refreshToken(); }

  window.citekeepApp = {
    loadLibrary: async () => { const d = await dir(); try { return await Neutralino.filesystem.readFile(join(d, "library.json")); } catch { return null; } },
    saveLibrary: async json => {
      const d = await dir(), f = join(d, "library.json");
      try { await Neutralino.filesystem.copy(f, join(d, "library-previous.json"), { overwrite: true }); } catch {}
      await Neutralino.filesystem.writeFile(f, json);
      return true;
    },
    saveLibrarySync: () => true,
    // keep the current library as a dated backup and start an empty one
    archiveLibrary: async () => {
      const d = await dir(), f = join(d, "library.json");
      const stamp = new Date().toISOString().slice(0, 10);
      let name = "library-backup-" + stamp + ".json", n = 2;
      while (true) { try { await Neutralino.filesystem.getStats(join(d, name)); name = "library-backup-" + stamp + " (" + n++ + ").json"; } catch { break; } }
      try { await Neutralino.filesystem.move(f, join(d, name)); } catch { return null; }
      return name;
    },
    // ---- where the data lives, backups, moving computers ----
    dataInfo: async () => { const d = await dir(); return { dir: d, anchor: await anchor(), elsewhere: d !== await anchor(), missing: dataMoved, computer: await computerName() }; },
    // use (or create) a Citekeep folder somewhere else; copy this computer's data there unless that folder already has a library
    setDataDir: async (parent, mode) => {
      const target = /[\\/]Citekeep$/i.test(parent.replace(/[\\/]+$/, "")) ? parent.replace(/[\\/]+$/, "") : join(parent, "Citekeep");
      try { await Neutralino.filesystem.createDirectory(target); } catch {}
      const has = await exists(join(target, "library.json"));
      if (mode === "check") return { target, has };
      const cur = await dir();
      if (mode === "copy" && cur !== target) {
        for (const f of ["library.json", "library-previous.json", "settings.json", "pdf-index.json"]) { if (await exists(join(cur, f))) await Neutralino.filesystem.copy(join(cur, f), join(target, f), { overwrite: true }); }
      }
      const a = await anchor();
      if (target === a) { try { await Neutralino.filesystem.remove(join(a, "location.json")); } catch {} }
      else await Neutralino.filesystem.writeFile(join(a, "location.json"), JSON.stringify({ dataDir: await toPortable(target) }, null, 1));
      docsDir = null; sCache = null;
      return { target, has };
    },
    pickAnyFolder: async title => { await ready; const f = await Neutralino.os.showFolderDialog(title || "Choose a folder"); return f ? (isWin() ? f.replace(/\//g, "\\") : f) : null; },
    // a dated copy of the library once a day; the newest 10 are kept
    dailyBackup: async () => {
      const d = await dir(), bdir = join(d, "backups"), src = join(d, "library.json");
      if (!(await exists(src))) return [];
      try { await Neutralino.filesystem.createDirectory(bdir); } catch {}
      const today = join(bdir, "library-" + new Date().toISOString().slice(0, 10) + ".json");
      if (!(await exists(today))) await Neutralino.filesystem.copy(src, today);
      let ents = []; try { ents = (await Neutralino.filesystem.readDirectory(bdir)).filter(e => e.type === "FILE" && /^library-\d{4}-\d\d-\d\d\.json$/.test(e.entry)).map(e => e.entry).sort(); } catch {}
      while (ents.length > 10) { try { await Neutralino.filesystem.remove(join(bdir, ents.shift())); } catch { break; } }
      return ents.reverse();
    },
    restoreBackup: async name => {
      const d = await dir(), src = join(d, "backups", name);
      if (!/^library-\d{4}-\d\d-\d\d\.json$/.test(name) || !(await exists(src))) return false;
      try { await Neutralino.filesystem.copy(join(d, "library.json"), join(d, "library-previous.json"), { overwrite: true }); } catch {}
      await Neutralino.filesystem.copy(src, join(d, "library.json"), { overwrite: true });
      return true;
    },
    writeBinaryAt: async (folder, rel, data) => {
      const parts = rel.split(/[\\/]/).filter(s => s && s !== ".." && s !== "."); const file = parts.pop(); let d = folder;
      for (const s of parts) { d = join(d, s); try { await Neutralino.filesystem.createDirectory(d); } catch {} }
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      await Neutralino.filesystem.writeBinaryFile(join(d, file), u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
      return true;
    },
    makeDir: async p => { try { await Neutralino.filesystem.createDirectory(p); } catch {} return p; },
    documentsDir: async () => { await ready; return await Neutralino.os.getPath("documents"); },
    readText: async name => { const d = await dir(); try { return await Neutralino.filesystem.readFile(join(d, name)); } catch { return null; } },
    writeText: async (name, text) => { const d = await dir(); await Neutralino.filesystem.writeFile(join(d, name), text); return true; },
    readSettingsRaw: async () => getS(),
    writeSettingsRaw: async s => { await putS(s); return true; },
    // look for a folder with this name in the usual places on this computer
    findFolder: async (saved) => {
      const name = String(saved || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop(); if (!name) return null;
      const h = await home(); const bases = [];
      for (const k of ["documents", "desktop", "downloads"]) { try { bases.push(await Neutralino.os.getPath(k)); } catch {} }
      bases.push(h, join(h, "Google Drive"), join(h, "My Drive"), join(h, "OneDrive"), join(h, "OneDrive", "Documents"), join(h, "Dropbox"));
      if (isWin()) for (const L of "GHDEF") bases.push(L + ":\\My Drive", L + ":\\");
      const seen = new Set();
      for (const base of bases) {
        if (!base || seen.has(base.toLowerCase())) continue; seen.add(base.toLowerCase());
        if (await exists(join(base, name))) return join(base, name);
        let ents = []; try { ents = await Neutralino.filesystem.readDirectory(base); } catch { continue; }
        for (const e of ents.filter(e => e.type === "DIRECTORY" && !/^[.$]/.test(e.entry)).slice(0, 60)) if (await exists(join(base, e.entry, name))) return join(base, e.entry, name);
      }
      return null;
    },
    // one computer at a time on a shared library
    heartbeat: async (leaving) => {
      const d = await dir(), f = join(d, "in-use.json"), me = await computerName();
      let other = null;
      try { const j = JSON.parse(await Neutralino.filesystem.readFile(f)); if (j.computer !== me && Date.now() - j.at < 3 * 60 * 1000) other = j.computer; } catch {}
      if (leaving) { if (!other) { try { await Neutralino.filesystem.remove(f); } catch {} } return other; }
      if (!other) { try { await Neutralino.filesystem.writeFile(f, JSON.stringify({ computer: me, at: Date.now() })); } catch {} }
      return other;
    },
    // ---- updates from the GitHub releases page, fetched with Windows' own curl (no browser download warnings) ----
    appVersion: async () => { await ready; return String(window.NL_APPVERSION || ""); },
    updateCheck: async () => {
      await ready;
      const r = await Neutralino.os.execCommand(`curl.exe -sL --max-time 20 -H "User-Agent: Citekeep" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${UPDATE_REPO}/releases/latest"`);
      let j; try { j = JSON.parse(r.stdOut || ""); } catch { return { ok: false, error: "Couldn't reach GitHub. Check your internet connection." }; }
      if (!j.tag_name) return { ok: false, error: j.message || "No release found." };
      const asset = (j.assets || []).find(a => /setup.*\.exe$/i.test(a.name));
      return { ok: true, tag: j.tag_name, version: parseInt(String(j.tag_name).replace(/\D+/g, ""), 10) || 0, notes: j.body || "", page: j.html_url || "", asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null };
    },
    updateDownload: async (url, name) => {
      await ready;
      if (!url.startsWith("https://github.com/" + UPDATE_REPO + "/releases/download/")) return { ok: false, error: "Unexpected download address." };
      const safe = String(name).replace(/[^\w .()-]+/g, "_");
      let dl; try { dl = await Neutralino.os.getPath("downloads"); } catch { dl = await dir(); }
      const dest = join(dl, safe);
      const r = await Neutralino.os.execCommand(`curl.exe -sL --fail --max-time 900 -o "${dest}" "${url}"`);
      try { const s = await Neutralino.filesystem.getStats(dest); if ((s.size || 0) < 200000) throw 0; } catch { return { ok: false, error: "The download didn't finish. Try again." + (r.stdErr ? " (" + String(r.stdErr).slice(0, 120) + ")" : "") }; }
      return { ok: true, path: dest };
    },
    updateRun: async path => {
      await ready;
      if (!/Citekeep[^\\/]*Setup[^\\/]*\.exe$/i.test(path)) return false;
      try { if (typeof window.citekeepFlush === "function") await window.citekeepFlush(); } catch {}
      await Neutralino.os.execCommand(`start "" "${path}"`, { background: true });
      return true;
    },
    downloadsDir: async () => { await ready; try { return await Neutralino.os.getPath("downloads"); } catch { return ""; } },
    listPdfs: async folder => {
      await ready;
      let ents = []; try { ents = await Neutralino.filesystem.readDirectory(folder); } catch { return []; }
      const out = [];
      for (const e of ents) if (e.type === "FILE" && /\.pdf$/i.test(e.entry)) { try { const s = await Neutralino.filesystem.getStats(join(folder, e.entry)); out.push({ name: e.entry, size: s.size || 0, mtime: s.modifiedAt || 0 }); } catch {} }
      return out;
    },
    // put a PDF into the PDF folder under a free name; returns the name used
    placePdf: async (folder, name, src, data) => {
      await ready;
      const base = name.replace(/\.pdf$/i, ""); let pick = base + ".pdf", n = 2;
      while (true) { try { await Neutralino.filesystem.getStats(join(folder, pick)); pick = base + " (" + n++ + ").pdf"; } catch { break; } }
      if (src) await Neutralino.filesystem.move(src.folder ? join(src.folder, src.name) : src, join(folder, pick));
      else { const u8 = data instanceof Uint8Array ? data : new Uint8Array(data); await Neutralino.filesystem.writeBinaryFile(join(folder, pick), u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); }
      return pick;
    },
    libraryPath: async () => join(await dir(), "library.json"),
    showLibrary: async () => window.citekeepApp.showFile(join(await dir(), "library.json")),
    getSettings: async () => { const s = await getS(); return { pdfFolder: await fromPortable(s.pdfFolder || ""), pdfFolderSaved: s.pdfFolder || "", gClientId: s.gClientId || "", gClientSecret: s.gClientSecret ? "saved" : "", gSignedIn: !!s.gRefresh, aiProvider: s.aiProvider || "", aiUrl: s.aiUrl || "", aiModel: s.aiModel || "", aiCtx: s.aiCtx || "", claudeModel: s.claudeModel || "", claudeKey: s.claudeKey ? "saved" : "", matrixTitle: s.matrixTitle || "", libraryChoice: s.libraryChoice || "", unpaywallEmail: s.unpaywallEmail || "", watchDownloads: s.watchDownloads || "", addFromDownloads: s.addFromDownloads || "", aiRules: s.aiRules || "" }; },
    claudeKey: async () => (await getS()).claudeKey || "",
    setSetting: async (k, v) => {
      if (!["pdfFolder", "gClientId", "gClientSecret", "aiProvider", "aiUrl", "aiModel", "aiCtx", "claudeModel", "claudeKey", "matrixTitle", "libraryChoice", "unpaywallEmail", "watchDownloads", "addFromDownloads", "aiRules", "lastUpdateCheck"].includes(k)) return false;
      await setOne(k, k === "pdfFolder" ? await toPortable(v) : v);
      if (k === "gClientId" || k === "gClientSecret") { await setOne("gRefresh", null); token = null; }
      return true;
    },
    pickFolder: async () => { await ready; const f = await Neutralino.os.showFolderDialog("Choose your PDF folder"); if (!f) return null; const p = isWin() ? f.replace(/\//g, "\\") : f; await setOne("pdfFolder", await toPortable(p)); return p; },
    scanFolder: async folder => {
      await ready;
      const ents = await Neutralino.filesystem.readDirectory(folder, { recursive: true });
      const root = folder.replace(/[\\/]+$/, "").replace(/\\/g, "/");
      return ents.filter(e => e.type === "FILE" && /\.pdf$/i.test(e.entry) && !/(^|[\\/])\./.test(e.path))
        .map(e => { const pth = e.path.replace(/\\/g, "/"); return { path: pth.startsWith(root + "/") ? pth.slice(root.length + 1) : e.entry, name: e.entry }; });
    },
    openPdf: async (folder, rel, page) => {
      await ready;
      const full = join(folder, rel);
      try { await Neutralino.filesystem.getStats(full); } catch { return "missing"; }
      try { await Neutralino.os.open("file:///" + full.replace(/\\/g, "/").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:") + (page ? "#page=" + page : "")); return ""; }
      catch (e) { return "error"; }
    },
    pdfStats: async (folder, rel) => { await ready; try { const s = await Neutralino.filesystem.getStats(join(folder, rel)); return { size: s.size || 0, mtime: s.modifiedAt || 0 }; } catch { return null; } },
    readPdf: async (folder, rel) => { await ready; return await Neutralino.filesystem.readBinaryFile(join(folder, rel)); },
    loadPdfIndex: async () => { const d = await dir(); try { return await Neutralino.filesystem.readFile(join(d, "pdf-index.json")); } catch { return null; } },
    savePdfIndex: async json => { const d = await dir(); await Neutralino.filesystem.writeFile(join(d, "pdf-index.json"), json); return true; },
    saveFile: async (name, data) => {
      await ready;
      let def = name; try { def = join(await Neutralino.os.getPath("downloads"), name); } catch {}
      const p = await Neutralino.os.showSaveDialog("Save", { defaultPath: def, forceOverwrite: false });
      if (!p) return null;
      if (typeof data === "string") await Neutralino.filesystem.writeFile(p, data);
      else { const u8 = data instanceof Uint8Array ? data : new Uint8Array(data); await Neutralino.filesystem.writeBinaryFile(p, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); }
      return p;
    },
    showFile: async p => { try { toast("Saved to " + p); } catch {} },
    openLink: async u => { await ready; if (/^https?:\/\//i.test(u)) await Neutralino.os.open(u); },

    googleSignIn: async () => {
      await ready;
      const s = await getS();
      if (!s.gClientId) return { ok: false, error: "Enter your Google Client ID first." };
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      const state = b64url(crypto.getRandomValues(new Uint8Array(9)));
      pendingSignIn = { verifier, state, redirect: REDIRECT() };
      const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: s.gClientId, redirect_uri: pendingSignIn.redirect, response_type: "code", scope: "https://www.googleapis.com/auth/drive.metadata.readonly", code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent", state });
      await Neutralino.os.open(url);
      return { ok: false, pending: true };
    },
    googleFinish: async pasted => {
      const s = await getS();
      if (!pendingSignIn) return { ok: false, error: "Click Sign in to Google Drive first." };
      const m = String(pasted || "").trim().match(/^CK1:([^:]+):(.+)$/);
      if (!m) return { ok: false, error: "That doesn't look like the code from the Citekeep page. Copy it with the Copy button there." };
      if (m[1] !== pendingSignIn.state) return { ok: false, error: "That code is from an earlier sign-in. Click Sign in again." };
      const body = { code: m[2], client_id: s.gClientId, redirect_uri: pendingSignIn.redirect, grant_type: "authorization_code", code_verifier: pendingSignIn.verifier };
      if (s.gClientSecret) body.client_secret = s.gClientSecret;
      try {
        const j = await tokenRequest(body);
        if (j.refresh_token) await setOne("gRefresh", j.refresh_token);
        token = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
        pendingSignIn = null;
        return { ok: true };
      } catch (e) { return { ok: false, error: "Google refused the sign-in: " + e.message }; }
    },
    googleSignOut: async () => { await setOne("gRefresh", null); token = null; return true; },
    // read-only Drive lookups (file names, folders, dates, links; never contents)
    googleDrive: async (path, params) => {
      try {
        const tok = await accessToken();
        const r = await fetch("https://www.googleapis.com/drive/v3/" + path + (params ? "?" + new URLSearchParams(params) : ""), { headers: { Authorization: "Bearer " + tok } });
        const j = await r.json();
        if (r.status === 401) { token = null; return { ok: false, error: "NOT_SIGNED_IN" }; }
        if (!r.ok) return { ok: false, error: (j.error && j.error.message) || ("Google Drive answered " + r.status) };
        return { ok: true, data: j };
      } catch (e) { return { ok: false, error: e.message === "NOT_SIGNED_IN" ? "NOT_SIGNED_IN" : "Couldn't reach Google Drive." }; }
    },
    googleListPdfs: async () => {
      try {
        const tok = await accessToken();
        const files = []; let pageToken = "";
        for (let i = 0; i < 50; i++) {
          const qs = new URLSearchParams({ q: "mimeType='application/pdf' and trashed=false", fields: "nextPageToken, files(id, name, webViewLink)", pageSize: "1000", includeItemsFromAllDrives: "true", supportsAllDrives: "true" });
          if (pageToken) qs.set("pageToken", pageToken);
          const r = await fetch("https://www.googleapis.com/drive/v3/files?" + qs, { headers: { Authorization: "Bearer " + tok } });
          const j = await r.json();
          if (r.status === 401) { token = null; throw new Error("NOT_SIGNED_IN"); }
          if (!r.ok) throw new Error("Google Drive didn't answer: " + ((j.error && j.error.message) || r.status));
          files.push(...(j.files || []));
          if (!j.nextPageToken) break; pageToken = j.nextPageToken;
        }
        return { ok: true, files };
      } catch (e) { return { ok: false, error: e.message }; }
    },
  };
  // Save before the window closes
  ready.then(() => {
    try {
      Neutralino.events.on("windowClose", async () => {
        try { if (typeof window.citekeepFlush === "function") await window.citekeepFlush(); } catch {}
        try { await window.citekeepApp.heartbeat(true); } catch {}
        Neutralino.app.exit();
      });
    } catch {}
  });
})();
