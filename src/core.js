// ===== Citekeep core: APA formatting, parsing, document checking and linking =====
const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS = "http://www.w3.org/XML/1998/namespace";
const YR = "(?:19|20)\\d\\d[a-z]?|n\\.d\\.";

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fold(s) { return String(s || "").split("").map(c => c.normalize("NFD").charAt(0)).join(""); }
function norm(s) { return fold(String(s || "").replace(/[‘’]/g, "'")).replace(/\s+/g, " ").trim(); }

// ---------- APA 7 formatting from structured fields ----------
function initials(given) {
  given = norm(given);
  if (!given) return "";
  if (/^([A-Z]\.(\s|-)?)+$/.test(given.replace(/\s+/g, " ") + (given.endsWith(".") ? "" : ""))) return given;
  return given.split(/\s+/).map(part => part.split("-").map(p => p ? p[0].toUpperCase() + "." : "").join("-")).join(" ");
}
function personName(a) {
  if (a.org) return a.org;
  let s = a.family + (a.given ? ", " + initials(a.given) : "");
  if (a.suffix) s += ", " + a.suffix;
  return s;
}
function authorList(authors) {
  const n = (authors || []).length;
  if (!n) return "";
  const names = authors.map(personName);
  if (n === 1) return names[0];
  if (n <= 20) return names.slice(0, -1).join(", ") + ", & " + names[n - 1];
  return names.slice(0, 19).join(", ") + ", . . . " + names[n - 1];
}
function withPeriod(s) { s = s.trim(); return /[.?!]$/.test(s) ? s : s + "."; }
function linkPart(it) {
  if (it.doi) return " https://doi.org/" + esc(it.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""));
  if (it.url) return " " + esc(it.url);
  return "";
}
function yearLabel(it) { return (it.year || "n.d.") + (it.year ? (it._suffix || "") : ""); }
function formatReference(it) {
  if (it.refHtml && it.useRaw !== false) return typeof apaWording === "function" ? apaWording(it.refHtml) : it.refHtml;
  const A = esc(authorList(it.authors));
  const Y = "(" + esc(yearLabel(it)) + (it.date ? ", " + esc(it.date) : "") + ")";
  const T = esc(it.title || "Untitled");
  const C = esc(it.container || "");
  const t = it.type || "article";
  const lead = A ? withPeriod(A) + " " + Y + ". " : "";
  const titleFirst = !A; // no author: title moves to author position
  let out;
  if (t === "legal") {
    out = `${T}${it.legal ? ", " + esc(it.legal) : ""} (${esc(it.year || "n.d.")}).${linkPart(it)}`;
    return out;
  }
  if (t === "article") {
    let src = C ? `<i>${C}${it.volume ? ", " + esc(it.volume) : ""}</i>` + (it.issue ? `(${esc(it.issue)})` : "") + (it.pages ? ", " + esc(it.pages) : "") + "." : "";
    out = titleFirst ? `${withPeriod(T)} ${Y}. ${src}` : `${lead}${withPeriod(T)} ${src}`;
  } else if (t === "chapter") {
    const eds = it.editors ? `In ${esc(it.editors)} (${/&| and /.test(it.editors) ? "Eds." : "Ed."}), ` : "In ";
    const tail = `${eds}<i>${C}</i>${it.pages ? ` (pp. ${esc(it.pages)})` : ""}.${it.publisher ? " " + withPeriod(esc(it.publisher)) : ""}`;
    out = titleFirst ? `${withPeriod(T)} ${Y}. ${tail}` : `${lead}${withPeriod(T)} ${tail}`;
  } else if (t === "webpage") {
    const tail = `${C ? " " + withPeriod(C) : ""}`;
    out = titleFirst ? `<i>${T}</i>. ${Y}.${tail}` : `${lead}<i>${withPeriod(T)}</i>${tail}`;
  } else { // book, report, other
    const extra = (it.edition ? ` (${esc(it.edition)} ed.)` : "") + (it.reportNo ? ` (${esc(it.reportNo)})` : "");
    const orgName = it.authors && it.authors.length === 1 && it.authors[0].org;
    const pub = it.publisher && it.publisher !== orgName ? " " + withPeriod(esc(it.publisher)) : "";
    out = titleFirst ? `<i>${T}</i>${extra}. ${Y}.${pub}` : `${lead}<i>${T}</i>${extra}.${pub}`;
  }
  return out.replace(/\s+/g, " ").trim() + linkPart(it);
}

// ---------- in-text citation forms ----------
function citeName(it, narrative, first) {
  const a = it.authors || [];
  if (it.type === "legal" || !a.length) return it.title || "Untitled";
  if (a[0].org) {
    const ab = a[0].abbr;
    if (!ab) return a[0].org;
    return first ? (narrative ? `${a[0].org} (${ab})` : `${a[0].org} [${ab}]`) : ab;
  }
  const amp = narrative ? " and " : " & ";
  if (a.length === 1) return a[0].family;
  if (a.length === 2) return a[0].family + amp + a[1].family;
  return a[0].family + " et al.";
}
function citeForms(it) {
  const y = yearLabel(it);
  const a = it.authors || [];
  const out = {
    parenthetical: `(${citeName(it, false, false)}, ${y})`,
    narrative: `${citeName(it, true, false)} (${y})`,
  };
  if (a[0] && a[0].org && a[0].abbr) {
    out.parentheticalFirst = `(${a[0].org} [${a[0].abbr}], ${y})`;
    out.narrativeFirst = `${a[0].org} (${a[0].abbr}, ${y})`;
  }
  return out;
}
// assign a/b suffixes to same-author same-year items
function assignSuffixes(items) {
  const groups = {};
  for (const it of items) {
    it._suffix = it.suffix || "";
    if (!it.year) continue;
    const key = (it.authors || []).map(a => (a.org || a.family || "").toLowerCase()).join("|") + "#" + it.year + "#" + (it.type === "legal" ? it.title : "");
    (groups[key] = groups[key] || []).push(it);
  }
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    if (g.every(i => i.suffix)) continue;
    g.sort((x, y) => norm(x.title).replace(/^(the|a|an) /i, "").localeCompare(norm(y.title).replace(/^(the|a|an) /i, "")));
    g.forEach((i, k) => { i._suffix = i.suffix || String.fromCharCode(97 + k); });
  }
}
function sortKey(it) {
  const a = it.authors || [];
  const lead = it.type === "legal" || !a.length ? (it.title || "") : a.map(x => x.org || (x.family + " " + (x.given || ""))).join(" ");
  return norm(lead).toLowerCase().replace(/[^a-z0-9 ]/g, "") + " " + (it.year || "0000") + (it._suffix || "");
}
// name forms used for matching typed citations against an item
function itemForms(it) {
  const a = it.authors || [];
  const forms = new Set();
  if (it.type === "legal" || !a.length) { forms.add(norm(it.title)); return [...forms]; }
  if (a[0].org) {
    forms.add(norm(a[0].org));
    if (a[0].abbr) { forms.add(a[0].abbr); forms.add(`${norm(a[0].org)} [${a[0].abbr}]`); forms.add(`${norm(a[0].org)} (${a[0].abbr}`); }
    return [...forms];
  }
  let base;
  if (a.length === 1) base = [a[0].family];
  else if (a.length === 2) base = [`${a[0].family} & ${a[1].family}`, `${a[0].family} and ${a[1].family}`];
  else {
    base = [`${a[0].family} et al.`];
    const fams = a.map(x => x.family || x.org || ""), last = fams[fams.length - 1], head = fams.slice(0, -1).join(", ");
    base.push(`${head}, & ${last}`, `${head}, and ${last}`, `${head} & ${last}`, `${head} and ${last}`);
  }
  for (const b of base) { forms.add(norm(b)); if (a[0].given) forms.add(norm(initials(a[0].given) + " " + b)); }
  return [...forms];
}

// ---------- parsing a typed APA reference (from a document) ----------
function parseRefText(text) {
  text = norm(text);
  const out = { raw: text, authors: [], year: "", suffix: "", date: "", title: "", type: "other" };
  const act = text.match(/^([^,(]+? Act(?: of \d{4})?)\b[^]*?\b((?:19|20)\d\d)\)/);
  if (act) { out.type = "legal"; out.title = act[1].trim(); out.year = act[2]; out.legal = text.slice(act[1].length).replace(/\s*\(?[^()]*\)\.?\s*(https?:\S+)?$/, "").replace(/^[,\s]+/, ""); const u = text.match(/https?:\/\/\S+/); if (u) out.url = u[0].replace(/[.,]$/, ""); return out; }
  const m = text.match(new RegExp("^(.*?) \\((" + "(?:19|20)\\d\\d" + ")([a-z]?)((?:, [^)]*)?)\\)\\.\\s*(.*)$")) || text.match(/^(.*?) \((n\.d\.)()((?:, [^)]*)?)\)\.\s*(.*)$/);
  if (!m) { out.title = text; return out; }
  let auth = m[1].replace(/\s*\((Eds?\.)\)\.?$/, "");
  out.year = m[2] === "n.d." ? "" : m[2]; out.suffix = m[3] || ""; out.date = (m[4] || "").replace(/^, /, "");
  const rest = m[5] || "";
  const tm = rest.match(/^(.+?\.)(?:\s|$)/) || rest.match(/^(.+?[?!])(?:\s|$)/);
  out.title = tm ? tm[1].replace(/\.$/, "") : rest;
  const doi = rest.match(/https?:\/\/(?:dx\.)?doi\.org\/(\S+?)\.?$/i);
  if (doi) out.doi = doi[1]; else { const u = rest.match(/https?:\/\/\S+/); if (u) out.url = u[0].replace(/[.,]$/, ""); }
  if (/, [A-Z][a-z]?\./.test(auth)) {
    const re = /(?:^|,\s*(?:&\s*)?|&\s*|\.\s*\.\s*\.\s*)([^,&]+?),\s*((?:[A-Z][a-z]?\.(?:[ -]?[A-Z]\.)*))(?:,\s*(Jr\.|Sr\.|II|III|IV))?(?=,|\s*&|$)/g;
    let x;
    while ((x = re.exec(auth))) out.authors.push({ family: x[1].trim().replace(/^\.\s*\.\s*\.\s*/, ""), given: x[2], ...(x[3] ? { suffix: x[3] } : {}) });
  }
  if (!out.authors.length) out.authors = [{ org: auth.replace(/\.$/, "") }];
  if (/^\s*\d+\s*\(/.test(rest) || / \d+\(\d+\), /.test(rest)) out.type = "article";
  return out;
}

// ---------- document reading ----------
function wEls(node, name) { return Array.from(node.getElementsByTagNameNS(WNS, name)); }
function pStyle(p) { const s = wEls(p, "pStyle")[0]; return s ? s.getAttributeNS(WNS, "val") || s.getAttribute("w:val") || "" : ""; }
function textRuns(p) {
  const runs = [];
  let pos = 0;
  for (const r of wEls(p, "r")) {
    const ts = wEls(r, "t");
    const txt = ts.map(t => t.textContent).join("");
    const insideLink = !!(r.parentNode && r.parentNode.localName === "hyperlink");
    runs.push({ r, ts, text: txt, start: pos, end: pos + txt.length, splittable: ts.length === 1 && Array.from(r.childNodes).filter(n => n.nodeType === 1 && n.localName !== "rPr" && n.localName !== "t").length === 0, insideLink });
    pos += txt.length;
  }
  return runs;
}
function paraText(p) { return textRuns(p).map(x => x.text).join(""); }
function runHtml(p) {
  return textRuns(p).map(x => {
    const ital = typeof runIsItalic === "function" ? runIsItalic(x.r) : wEls(x.r, "i").some(i => { const v = i.getAttributeNS(WNS, "val") || i.getAttribute("w:val"); return !v || (v !== "0" && v !== "false"); });
    return ital ? `<i>${esc(x.text)}</i>` : esc(x.text);
  }).join("").replace(/<\/i><i>/g, "");
}
function readDocument(dom) {
  const body = wEls(dom, "body")[0];
  const paras = wEls(body, "p");
  let ri = -1;
  paras.forEach((p, i) => { if (/^(references|reference list|references cited|bibliography|works cited|literature cited|sources)$/i.test(paraText(p).trim().replace(/:$/, ""))) ri = i; });
  const bodyParas = ri < 0 ? paras : paras.slice(0, ri);
  const refParas = [];
  if (ri >= 0) {
    for (const p of paras.slice(ri + 1)) {
      const st = pStyle(p);
      const tx = paraText(p).trim();
      if (/^Heading/i.test(st) && tx) break;
      if (tx) refParas.push(p);
    }
  }
  return { bodyParas, refParas, hasRefHeading: ri >= 0 };
}

// ---------- citation matching ----------
function buildFormIndex(entries) {
  // entries: [{id, forms:[...], year}]  year includes suffix
  const idx = new Map();
  const dup = [];
  for (const e of entries) for (const f of e.forms) {
    const k = norm(f) + "|" + e.year;
    if (idx.has(k) && idx.get(k) !== e.id) dup.push(k);
    idx.set(k, e.id);
  }
  const names = [...new Set(entries.flatMap(e => e.forms.map(norm)))].sort((a, b) => b.length - a.length);
  return { idx, names, dup };
}
function findAbbreviations(bodyText, orgNames) {
  const found = {};
  for (const n of orgNames) {
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[(\\[]([A-Z][A-Za-z]{1,9})[)\\],]", "g");
    const m = re.exec(bodyText);
    if (m) found[n] = m[1];
  }
  return found;
}
const LOC = ",\\s*(?:pp?\\.|paras?\\.|chaps?\\.|secs?\\.|Section|Table|Figure|Appendix|Slide|Line|n\\.)\\s*[^,;()]*";
const PREFIX = /^(?:e\.g\.,?|i\.e\.,?|see also|see|cf\.|compare|for example,?|for a review,? see|also|as cited in)\s+/i;
function findCitations(text, F) {
  const spans = [], misses = [];
  const T = fold(text.replace(/[‘’]/g, "'")).replace(/[\u00A0\u2000-\u200B\u202F\t]/g, " ");
  const reParen = new RegExp("\\(([^()]*?(?:" + YR + ")[^()]*?)\\)", "g");
  const yearsOnly = new RegExp("^(?:" + YR + ")(?:, (?:" + YR + "))*$");
  const locEnd = new RegExp("(?:" + LOC + ")+$");
  let m;
  while ((m = reParen.exec(T))) {
    const inner = m[1], base = m.index + 1;
    const core = inner.replace(locEnd, "");
    const hasLoc = core.length !== inner.length;
    if (yearsOnly.test(core)) {
      const pre = T.slice(0, m.index);
      let hit = null, tail = "";
      for (const nm of F.names) {
        for (const suf of [" ", "'s ", "' ", ""]) if (pre.endsWith(nm + suf)) { hit = nm; tail = suf; break; }
        if (hit) break;
      }
      if (!hit) {
        const g = pre.match(/([A-Z][\w'\-.]*(?:,? (?:(?:of|on|for|and|the|in|&) )?[A-Z][\w'\-.]*)*(?: et al\.)?)(?:'s?)? $/);
        if (g) {
          const ns = pre.length - g[0].length, ctx = text.slice(Math.max(0, m.index - 60), m.index + m[0].length);
          for (const y of core.matchAll(new RegExp(YR, "g"))) misses.push({ name: norm(g[1]), years: y[0], context: ctx, narrative: true, ns, ne: ns + g[1].length, ys: base + y.index, ye: base + y.index + y[0].length });
        }
        continue;
      }
      const st = m.index - hit.length - tail.length;
      const yrs = [...core.matchAll(new RegExp(YR, "g"))].map(y => [y[0], base + y.index]);
      yrs.forEach(([y, pos], j) => {
        const id = F.idx.get(hit + "|" + y);
        if (!id) { misses.push({ name: hit, years: y, context: text.slice(Math.max(0, st - 30), m.index + m[0].length), narrative: true, ns: st, ne: st + hit.length, ys: pos, ye: pos + y.length }); return; }
        const last = j === yrs.length - 1;
        const close = last && !hasLoc ? 1 : 0;
        spans.push(j === 0 ? [st, pos + y.length + (yrs.length === 1 ? close : 0), id, hit, y, { narr: true, first: true, ns: st, ne: st + hit.length, name: text.slice(st, st + hit.length), group: m.index }] : [pos, pos + y.length + close, id, hit, y, { narr: true, first: false, group: m.index }]);
      });
      continue;
    }
    // parenthetical: segments separated by semicolons, each may hold "X, 2020, as cited in Y, 2021"
    const pieces = [];
    let off = 0;
    for (const seg of inner.split("; ")) {
      const segStart = base + off; off += seg.length + 2;
      let sub = 0;
      for (const part of seg.split(/, (?=as cited in )/i)) { pieces.push([part, segStart + sub]); sub += part.length + 2; }
    }
    for (let [sg, s0] of pieces) {
      const pf = sg.match(PREFIX);
      if (pf) { s0 += pf[0].length; sg = sg.slice(pf[0].length); }
      sg = sg.replace(locEnd, "");
      const mm = sg.match(new RegExp("^(.*?),? ((?:" + YR + ")(?:, (?:" + YR + "))*)$"));
      if (!mm || !/^[A-Z]/.test(mm[1]) || !/[a-z]/i.test(mm[1])) continue;
      const nm = norm(mm[1]);
      const yStart = s0 + sg.lastIndexOf(mm[2]);
      const yrs = [...mm[2].matchAll(new RegExp(YR, "g"))].map(y => [y[0], yStart + y.index]);
      yrs.forEach(([y, pos], j) => {
        const id = F.idx.get(nm + "|" + y);
        if (!id) { misses.push({ name: nm, years: y, context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length), narrative: false, ns: s0, ne: s0 + mm[1].length, ys: pos, ye: pos + y.length }); return; }
        spans.push(j === 0 ? [s0, pos + y.length, id, nm, y, { narr: false, first: true, ns: s0, ne: s0 + mm[1].length, name: text.slice(s0, s0 + mm[1].length), group: m.index }] : [pos, pos + y.length, id, nm, y, { narr: false, first: false, group: m.index }]);
      });
    }
  }
  return { spans, misses };
}
function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function firstSurname(n) { return norm(n).replace(/^(?:[A-Z]\.\s?)+/, "").split(/,? (?:et al\.|&|and) |, /)[0].trim(); }
// best guesses for which reference an unmatched citation was meant for, best first
function candidatesFor(miss, entries, citedIds) {
  const fs = firstSurname(miss.name), y4 = miss.years.slice(0, 4);
  const scored = [];
  for (const e of entries) {
    const names = e.forms.map(norm);
    const sameName = names.includes(norm(miss.name));
    const efs = firstSurname(e.forms[0] || "");
    const d = lev(fs, efs);
    const ey = e.year, ey4 = ey.slice(0, 4);
    let score = 0;
    if (sameName && ey !== miss.years) score = 90 - Math.min(20, Math.abs(+ey4 - +y4 || 0));
    else if (efs.toLowerCase() === fs.toLowerCase() && ey4 === y4) score = 85;
    else if (efs.toLowerCase() === fs.toLowerCase()) score = 60 - Math.min(20, Math.abs(+ey4 - +y4 || 0));
    else if (d <= 2 && fs.length > 3 && ey4 === y4) score = 80 - d * 5;
    else if (d <= 2 && fs.length > 3) score = 45 - d * 5;
    if (!score) continue;
    if (citedIds && !citedIds.has(e.id)) score += 8; // an uncited reference is the likelier partner
    scored.push([score, e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(x => x[1]).slice(0, 3);
}
function suggest(miss, F) {
  const out = [];
  const first = miss.name.split(/ (?:et al\.|&|and) /)[0].replace(/^[A-Z]\.(?: [A-Z]\.)* /, "");
  for (const k of F.idx.keys()) {
    const [nm, y] = k.split("|");
    if (nm === miss.name && y !== miss.years) out.push(`${nm} (${y})`);
    else if (nm !== miss.name && nm.startsWith(first) && y === miss.years) out.push(`${nm} (${y})`);
  }
  return [...new Set(out)].slice(0, 4);
}

// entries from the document's own reference list
function docEntries(refParas, bodyText) {
  const parsed = refParas.map((p, i) => ({ p, i, ref: parseRefText(paraText(p)) }));
  const orgs = parsed.filter(x => x.ref.authors[0] && x.ref.authors[0].org).map(x => x.ref.authors[0].org);
  const abbr = findAbbreviations(bodyText, [...new Set(orgs)]);
  for (const x of parsed) { const a = x.ref.authors[0]; if (a && a.org && abbr[a.org]) a.abbr = abbr[a.org]; }
  const entries = parsed.map(x => ({ id: "r" + x.i, p: x.p, ref: x.ref, year: x.ref.year ? x.ref.year + x.ref.suffix : "n.d.", forms: itemForms(x.ref).concat(x.ref.raw.match(/[’']/) ? itemForms(x.ref).map(f => f.replace(/’/g, "'")) : []) }));
  return entries;
}
function checkDocument(dom, libraryItems) {
  const { bodyParas, refParas, hasRefHeading } = readDocument(dom);
  const bodyText = bodyParas.map(paraText).join("\n");
  const entries = docEntries(refParas, bodyText);
  const F = buildFormIndex(entries);
  const perPara = [];
  const cited = new Map();
  const misses = [];
  for (const p of bodyParas) {
    const t = paraText(p);
    if (!t.trim()) continue;
    const r = findCitations(t, F);
    if (r.spans.length) perPara.push({ p, spans: r.spans });
    for (const s of r.spans) cited.set(s[2], (cited.get(s[2]) || 0) + 1);
    for (const x of r.misses) { x.hints = suggest(x, F); x.p = p; misses.push(x); }
  }
  const uncited = entries.filter(e => !cited.has(e.id));
  const citedIds = new Set(cited.keys());
  for (const x of misses) x.candidates = candidatesFor(x, entries, citedIds);
  // library comparison
  let lib = null;
  if (libraryItems && libraryItems.length) {
    assignSuffixes(libraryItems);
    const LF = buildFormIndex(libraryItems.map(it => ({ id: it.id, year: it.year ? it.year + (it._suffix || "") : "n.d.", forms: itemForms(it) })));
    const inLib = [], notInLib = [];
    for (const e of entries) {
      const hit = e.forms.map(f => LF.idx.get(norm(f) + "|" + e.year)).find(Boolean);
      (hit ? inLib : notInLib).push({ entry: e, itemId: hit });
    }
    lib = { inLib, notInLib };
  }
  const total = perPara.reduce((n, x) => n + x.spans.length, 0);
  return { hasRefHeading, entries, perPara, misses, uncited, cited, total, lib, dup: F.dup };
}

// ---------- corrections ----------
function replaceRange(dom, p, start, end, newText) {
  for (const c of [end, start]) {
    const run = textRuns(p).find(x => x.start < c && c < x.end);
    if (run && run.splittable) splitRun(dom, run, c - run.start);
  }
  const runs = textRuns(p).filter(x => x.start >= start && x.end <= end && x.end > x.start);
  if (!runs.length || runs.reduce((n, x) => n + x.text.length, 0) !== end - start) return false;
  runs[0].ts[0].textContent = newText; runs[0].ts[0].setAttributeNS(XMLNS, "xml:space", "preserve");
  for (const x of runs.slice(1)) x.r.parentNode.removeChild(x.r);
  return true;
}
function pickForm(entry, miss) {
  const forms = entry.forms.map(norm);
  const narr = miss.narrative;
  const m = norm(miss.name);
  const want = (f) => (/ et al\.$/.test(m) ? / et al\.$/.test(f) : true) && (narr ? !/ & /.test(f) : !/ and /.test(f));
  const abbr = forms.find(f => /^[A-Z]{2,10}$/.test(f));
  if (abbr && /^[A-Z]{2,10}$/.test(m)) return abbr;
  return forms.find(f => want(f) && !/[\[(]/.test(f) && !/^(?:[A-Z]\.\s?)+/.test(f) && f.split(", ").length <= 2) || forms[0];
}
// fixes: [{missIndex, entryId}] against result.misses; edits the paragraphs in place
function applyFixes(dom, result, fixes) {
  const byP = new Map();
  for (const f of fixes) {
    const miss = result.misses[f.missIndex], entry = result.entries.find(e => e.id === f.entryId);
    if (!miss || !entry || !miss.p) continue;
    const edits = [];
    const ey = entry.year;
    if (ey !== miss.years) edits.push([miss.ys, miss.ye, ey]);
    if (!entry.forms.map(norm).includes(norm(miss.name))) edits.push([miss.ns, miss.ne, pickForm(entry, miss)]);
    if (!byP.has(miss.p)) byP.set(miss.p, []);
    byP.get(miss.p).push(...edits);
  }
  let done = 0;
  for (const [p, edits] of byP) {
    edits.sort((a, b) => b[0] - a[0]);
    for (const [s, e, t] of edits) if (replaceRange(dom, p, s, e, t)) done++;
  }
  return done;
}

// ---------- linking ----------
function stripOldLinks(dom) {
  for (const h of wEls(dom, "hyperlink")) {
    const a = h.getAttributeNS(WNS, "anchor") || h.getAttribute("w:anchor") || "";
    if (a.startsWith("_Cite")) { while (h.firstChild) h.parentNode.insertBefore(h.firstChild, h); h.parentNode.removeChild(h); }
  }
  const ids = new Set();
  for (const b of wEls(dom, "bookmarkStart")) {
    const n = b.getAttributeNS(WNS, "name") || b.getAttribute("w:name") || "";
    if (n.startsWith("_Cite")) { ids.add(b.getAttributeNS(WNS, "id") || b.getAttribute("w:id")); b.parentNode.removeChild(b); }
  }
  for (const b of wEls(dom, "bookmarkEnd")) if (ids.has(b.getAttributeNS(WNS, "id") || b.getAttribute("w:id"))) b.parentNode.removeChild(b);
}
function wEl(dom, name, attrs) { const e = dom.createElementNS(WNS, "w:" + name); for (const [k, v] of Object.entries(attrs || {})) e.setAttributeNS(WNS, "w:" + k, v); return e; }
function splitRun(dom, run, k) {
  const r2 = run.r.cloneNode(true);
  const t1 = run.ts[0], t2 = wEls(r2, "t")[0];
  const txt = t1.textContent;
  t1.textContent = txt.slice(0, k); t2.textContent = txt.slice(k);
  t1.setAttributeNS(XMLNS, "xml:space", "preserve"); t2.setAttributeNS(XMLNS, "xml:space", "preserve");
  run.r.parentNode.insertBefore(r2, run.r.nextSibling);
}
function linkDocument(dom, result) {
  stripOldLinks(dom);
  let maxId = 0;
  for (const b of wEls(dom, "bookmarkStart")) maxId = Math.max(maxId, +(b.getAttributeNS(WNS, "id") || b.getAttribute("w:id") || 0));
  const bm = {};
  result.entries.forEach((e, i) => {
    const name = "_Cite" + String(i + 1).padStart(3, "0");
    bm[e.id] = name;
    const id = String(maxId + 1 + i);
    const s = wEl(dom, "bookmarkStart", { id, name }), en = wEl(dom, "bookmarkEnd", { id });
    const pPr = wEls(e.p, "pPr")[0];
    if (pPr && pPr.parentNode === e.p) e.p.insertBefore(s, pPr.nextSibling); else e.p.insertBefore(s, e.p.firstChild);
    e.p.appendChild(en);
  });
  let linked = 0, skipped = 0;
  for (const { p, spans } of result.perPara) {
    const cuts = [...new Set(spans.flatMap(s => [s[0], s[1]]))].sort((a, b) => a - b);
    for (const c of cuts) {
      const runs = textRuns(p);
      const run = runs.find(x => x.start < c && c < x.end);
      if (run && run.splittable && !run.insideLink) splitRun(dom, run, c - run.start);
    }
    const runs = textRuns(p);
    for (const [s, e, id] of spans) {
      const grp = runs.filter(x => x.start >= s && x.end <= e && x.end > x.start);
      const covered = grp.reduce((n, x) => n + x.text.length, 0);
      if (!grp.length || covered !== e - s || grp.some(x => x.insideLink || x.r.parentNode !== grp[0].r.parentNode)) { skipped++; continue; }
      const h = wEl(dom, "hyperlink", { anchor: bm[id], history: "1" });
      grp[0].r.parentNode.insertBefore(h, grp[0].r);
      for (const x of grp) h.appendChild(x.r);
      linked++;
    }
  }
  return { linked, skipped };
}

// ---------- RIS / BibTeX ----------
const RIS_TYPES = { JOUR: "article", MGZN: "article", NEWS: "article", BOOK: "book", EBOOK: "book", CHAP: "chapter", ECHAP: "chapter", RPRT: "report", GOVDOC: "report", ELEC: "webpage", WEB: "webpage", BLOG: "webpage", STAT: "legal", BILL: "legal", CASE: "legal", THES: "report" };
function splitPersonName(s) {
  s = norm(s);
  if (!s) return null;
  if (s.includes(",")) { const [f, ...g] = s.split(","); return { family: f.trim(), given: initials(g.join(" ").trim()) }; }
  const parts = s.split(" ");
  if (parts.length === 1) return { org: s };
  return { family: parts.pop(), given: initials(parts.join(" ")) };
}
function parseRIS(txt) {
  const items = []; let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])  - ?(.*)$/);
    if (!m) continue;
    const [, tag, val] = m;
    if (tag === "TY") { cur = { type: RIS_TYPES[val.trim()] || "other", authors: [], tags: [] }; continue; }
    if (!cur) continue;
    if (tag === "ER") { items.push(cur); cur = null; continue; }
    const v = val.trim();
    if (["AU", "A1"].includes(tag)) { const p = splitPersonName(v); if (p) cur.authors.push(p); }
    else if (tag === "A2" || tag === "ED") cur.editors = (cur.editors ? cur.editors + " & " : "") + v;
    else if (["PY", "Y1", "DA"].includes(tag)) { const y = v.match(/(19|20)\d\d/); if (y && !cur.year) cur.year = y[0]; }
    else if (["TI", "T1"].includes(tag)) cur.title = v;
    else if (["T2", "JO", "JF", "BT"].includes(tag)) cur.container = cur.container || v;
    else if (tag === "VL") cur.volume = v;
    else if (tag === "IS") cur.issue = v;
    else if (tag === "SP") cur.pages = v + (cur.pages && cur.pages.startsWith("–") ? cur.pages : "");
    else if (tag === "EP") cur.pages = (cur.pages || "") + "–" + v;
    else if (tag === "PB") cur.publisher = v;
    else if (tag === "DO") cur.doi = v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    else if (tag === "UR") cur.url = cur.url || v;
    else if (tag === "KW") cur.tags.push(v);
    else if (tag === "N1" || tag === "AB") { if (tag === "N1") cur.notes = (cur.notes ? cur.notes + "\n" : "") + v; }
    else if (tag === "ET") cur.edition = v;
  }
  return items;
}
function parseBibTeX(txt) {
  const items = [];
  const re = /@(\w+)\s*\{\s*([^,]*),/g; let m;
  const MAP = { article: "article", book: "book", incollection: "chapter", inbook: "chapter", techreport: "report", report: "report", online: "webpage", misc: "other", phdthesis: "report", mastersthesis: "report", legislation: "legal" };
  while ((m = re.exec(txt))) {
    let i = re.lastIndex, depth = 1, start = i;
    while (i < txt.length && depth > 0) { if (txt[i] === "{") depth++; else if (txt[i] === "}") depth--; i++; }
    const body = txt.slice(start, i - 1);
    re.lastIndex = i;
    const f = {};
    const fr = /(\w+)\s*=\s*/g; let fm;
    while ((fm = fr.exec(body))) {
      let j = fr.lastIndex, val = "";
      if (body[j] === "{") { let d = 1, k = j + 1; while (k < body.length && d) { if (body[k] === "{") d++; else if (body[k] === "}") d--; k++; } val = body.slice(j + 1, k - 1); fr.lastIndex = k; }
      else if (body[j] === '"') { const k = body.indexOf('"', j + 1); val = body.slice(j + 1, k); fr.lastIndex = k + 1; }
      else { const k = body.slice(j).search(/[,\n}]/); val = body.slice(j, k < 0 ? undefined : j + k); fr.lastIndex = j + (k < 0 ? body.length : k); }
      f[fm[1].toLowerCase()] = val.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    }
    const it = { type: MAP[m[1].toLowerCase()] || "other", authors: (f.author || "").split(/\s+and\s+/).map(splitPersonName).filter(Boolean), tags: f.keywords ? f.keywords.split(/[,;]\s*/) : [] };
    if (f.title) it.title = f.title;
    it.container = f.journal || f.journaltitle || f.booktitle || "";
    for (const k of ["volume", "publisher", "edition", "doi", "url"]) if (f[k]) it[k] = f[k];
    if (f.number) it.issue = f.number;
    if (f.pages) it.pages = f.pages.replace(/--?/, "–");
    if (f.year || f.date) { const y = (f.year || f.date).match(/(19|20)\d\d/); if (y) it.year = y[0]; }
    if (f.editor) it.editors = f.editor.split(/\s+and\s+/).join(" & ");
    if (f.institution && !it.publisher) it.publisher = f.institution;
    items.push(it);
  }
  return items;
}
function toRIS(items) {
  const R = { article: "JOUR", book: "BOOK", chapter: "CHAP", report: "RPRT", webpage: "ELEC", legal: "STAT", other: "GEN" };
  return items.map(it => {
    const L = [`TY  - ${R[it.type] || "GEN"}`];
    for (const a of it.authors || []) L.push(`AU  - ${a.org || a.family + (a.given ? ", " + a.given : "")}`);
    if (it.year) L.push(`PY  - ${it.year}`);
    if (it.title) L.push(`TI  - ${it.title}`);
    if (it.container) L.push(`T2  - ${it.container}`);
    if (it.volume) L.push(`VL  - ${it.volume}`);
    if (it.issue) L.push(`IS  - ${it.issue}`);
    if (it.pages) { const [sp, ep] = it.pages.split(/[–-]/); L.push(`SP  - ${sp}`); if (ep) L.push(`EP  - ${ep}`); }
    if (it.publisher) L.push(`PB  - ${it.publisher}`);
    if (it.doi) L.push(`DO  - ${it.doi}`);
    if (it.url) L.push(`UR  - ${it.url}`);
    for (const t of it.tags || []) L.push(`KW  - ${t}`);
    L.push("ER  - ");
    return L.join("\r\n");
  }).join("\r\n\r\n") + "\r\n";
}
function toBibTeX(items) {
  const B = { article: "article", book: "book", chapter: "incollection", report: "techreport", webpage: "online", legal: "misc", other: "misc" };
  const used = {};
  return items.map(it => {
    const a = (it.authors || [])[0];
    let key = ((a && (a.family || a.org)) || "anon").replace(/[^A-Za-z]/g, "").slice(0, 20) + (it.year || "nd");
    used[key] = (used[key] || 0) + 1; if (used[key] > 1) key += String.fromCharCode(96 + used[key]);
    const f = [];
    const auth = (it.authors || []).map(x => x.org ? `{${x.org}}` : `${x.family}, ${x.given || ""}`.trim()).join(" and ");
    if (auth) f.push(`  author = {${auth}}`);
    if (it.title) f.push(`  title = {${it.title}}`);
    if (it.container) f.push(`  ${it.type === "article" ? "journal" : "booktitle"} = {${it.container}}`);
    for (const k of ["year", "volume", "publisher", "edition", "doi", "url"]) if (it[k]) f.push(`  ${k} = {${it[k]}}`);
    if (it.issue) f.push(`  number = {${it.issue}}`);
    if (it.pages) f.push(`  pages = {${it.pages.replace("–", "--")}}`);
    if ((it.tags || []).length) f.push(`  keywords = {${it.tags.join(", ")}}`);
    return `@${B[it.type] || "misc"}{${key},\n${f.join(",\n")}\n}`;
  }).join("\n\n") + "\n";
}

if (typeof module !== "undefined" && module.exports) module.exports = { applyFixes, candidatesFor, formatReference, citeForms, assignSuffixes, sortKey, itemForms, parseRefText, readDocument, checkDocument, linkDocument, paraText, runHtml, parseRIS, parseBibTeX, toRIS, toBibTeX, norm, esc, initials };
