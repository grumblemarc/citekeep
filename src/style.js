// ===== Citekeep APA style checks: in-text citations, reference list, quotations =====
const RPR_ORDER = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"];
// Italics can come from the run itself, a character style (like Emphasis), the paragraph's style, or the document default
var DOC_STYLES = null;
function loadStyles(xml) {
  const map = {}; let defI;
  try {
    const d = new DOMParser().parseFromString(xml, "application/xml");
    for (const st of wEls(d, "style")) {
      const id = st.getAttributeNS(WNS, "styleId") || st.getAttribute("w:styleId");
      const kids = Array.from(st.childNodes).filter(n => n.nodeType === 1);
      const based = kids.find(n => n.localName === "basedOn");
      const rPr = kids.find(n => n.localName === "rPr");
      const iEl = rPr && Array.from(rPr.childNodes).find(n => n.nodeType === 1 && n.localName === "i");
      map[id] = { based: based ? (based.getAttributeNS(WNS, "val") || based.getAttribute("w:val")) : null, i: iEl ? onOff(iEl) : undefined, type: st.getAttributeNS(WNS, "type") || st.getAttribute("w:type"), isDefault: /^(1|true)$/.test(st.getAttributeNS(WNS, "default") || st.getAttribute("w:default") || "") };
    }
    const rd = wEls(d, "rPrDefault")[0];
    const di = rd && wEls(rd, "i")[0];
    if (di) defI = onOff(di);
  } catch (e) {}
  map.__default = defI;
  return map;
}
function onOff(el) { const v = el.getAttributeNS(WNS, "val") || el.getAttribute("w:val"); return !v || !/^(0|false|off)$/i.test(v); }
function styleItalic(id, depth) {
  if (!DOC_STYLES || !id || (depth || 0) > 12) return undefined;
  const s = DOC_STYLES[id]; if (!s) return undefined;
  if (s.i !== undefined) return s.i;
  return styleItalic(s.based, (depth || 0) + 1);
}
function runIsItalic(r) {
  const rPr = Array.from(r.childNodes).find(n => n.nodeType === 1 && n.localName === "rPr");
  if (rPr) {
    const iEl = Array.from(rPr.childNodes).find(n => n.nodeType === 1 && n.localName === "i");
    if (iEl) return onOff(iEl);
    const rs = Array.from(rPr.childNodes).find(n => n.nodeType === 1 && n.localName === "rStyle");
    if (rs) { const v = styleItalic(rs.getAttributeNS(WNS, "val") || rs.getAttribute("w:val")); if (v !== undefined) return v; }
  }
  let p = r.parentNode; while (p && p.localName !== "p") p = p.parentNode;
  if (p && DOC_STYLES) {
    const ps = wEls(p, "pStyle")[0];
    let pid = ps ? (ps.getAttributeNS(WNS, "val") || ps.getAttribute("w:val")) : null;
    if (!pid) { const def = Object.entries(DOC_STYLES).find(([k, v]) => v && v.type === "paragraph" && v.isDefault); pid = def ? def[0] : null; }
    const v = styleItalic(pid); if (v !== undefined) return v;
  }
  return !!(DOC_STYLES && DOC_STYLES.__default);
}
function setRunItalic(dom, r) {
  let rPr = Array.from(r.childNodes).find(n => n.nodeType === 1 && n.localName === "rPr");
  if (!rPr) { rPr = dom.createElementNS(WNS, "w:rPr"); r.insertBefore(rPr, r.firstChild); }
  for (const old of Array.from(rPr.childNodes).filter(n => n.nodeType === 1 && n.localName === "i")) rPr.removeChild(old);
  const iEl = dom.createElementNS(WNS, "w:i");
  const at = RPR_ORDER.indexOf("i");
  const next = Array.from(rPr.childNodes).find(n => n.nodeType === 1 && RPR_ORDER.indexOf(n.localName) > at);
  rPr.insertBefore(iEl, next || null);
}
function rangeIsItalic(p, s, e) {
  const runs = textRuns(p).filter(x => x.end > s && x.start < e && /[A-Za-z0-9]/.test(x.text.slice(Math.max(0, s - x.start), e - x.start)));
  return runs.length > 0 && runs.every(x => runIsItalic(x.r));
}
function setItalic(dom, p, s, e) {
  for (const c of [e, s]) {
    const run = textRuns(p).find(x => x.start < c && c < x.end);
    if (run && run.splittable) splitRun(dom, run, c - run.start);
  }
  let n = 0;
  for (const x of textRuns(p)) if (x.start >= s && x.end <= e && x.end > x.start) { setRunItalic(dom, x.r); n++; }
  return n;
}

// end of the first sentence of a reference's remainder (the title), skipping abbreviations like "No." and initials
function firstSentence(rest) {
  const ABBR = /(?:^|\s|\()(?:No|Nos|Vol|Vols|Ed|Eds|ed|eds|pp|p|Rev|Inc|Jr|Sr|St|Dr|vs|Co|Corp|Dept|e\.g|i\.e|U\.S|[A-Z])$/;
  for (const m of rest.matchAll(/\.\s+/g)) {
    if (ABBR.test(rest.slice(0, m.index))) continue;
    return { text: rest.slice(0, m.index + 1), len: m.index + m[0].length };
  }
  const q = rest.match(/^(.+?[?!])\s+/);
  return q ? { text: q[1], len: q[0].length } : null;
}
// Where APA expects italics in one reference entry: [{s, e, what}] in the paragraph's text
function italicTargets(text) {
  if (/^[^,(]+? Act\b/.test(text)) return [];
  const dm = text.match(/\((?:(?:19|20)\d\d[a-z]?|n\.d\.)(?:, [^)]*)?\)\.\s+/);
  if (!dm) return [];
  const restStart = dm.index + dm[0].length, rest = text.slice(restStart);
  // book chapter: In E. Editor (Ed.), Book title (pp. 1–20)
  const ch = rest.match(/\bIn (.+?) \((?:Eds?\.)\), (.+?)(?= \((?:pp?\.|Vol\.)|\. )/);
  if (ch) { const s = restStart + ch.index + ch[0].length - ch[2].length; return [{ s, e: s + ch[2].length, what: "book title" }]; }
  // journal article: Title. Journal Name, 12(3), 45–67.  The title may end in . ? or !
  const JR = /^([^.?!]+?), (\d+)(?=\s*\(|,|\.)/;
  for (const b of rest.matchAll(/[.?!]\s+/g)) {
    if (b[0][0] === "." && /(?:^|\s|\()(?:No|Nos|Vol|Vols|Ed|Eds|ed|eds|pp|p|Rev|Inc|Jr|Sr|St|Dr|vs|Co|e\.g|i\.e|U\.S|[A-Z])$/.test(rest.slice(0, b.index))) continue;
    const after = rest.slice(b.index + b[0].length);
    const jm = after.match(JR);
    if (jm && !/^https?:/.test(jm[1])) {
      const s0 = restStart + b.index + b[0].length;
      const vs = s0 + jm[0].length - jm[2].length;
      return [{ s: s0, e: s0 + jm[1].length, what: "journal name" }, { s: vs, e: vs + jm[2].length, what: "volume number" }];
    }
  }
  // journal article not yet in an issue: Title. Journal Name. Advance online publication.
  const ao = rest.search(/\.\s+Advance online publication\b/i);
  if (ao > 0) {
    let js = -1;
    for (const b of rest.slice(0, ao).matchAll(/[.?!]\s+/g)) {
      if (b[0][0] === "." && /(?:^|\s|\()(?:No|Vol|Ed|Eds|pp|p|Inc|Jr|Sr|St|Dr|vs|Co|U\.S|[A-Z])$/.test(rest.slice(0, b.index))) continue;
      js = b.index + b[0].length;
    }
    if (js > 0 && ao - js > 2) return [{ s: restStart + js, e: restStart + ao, what: "journal name" }];
  }
  const fs1 = firstSentence(rest);
  const tm = fs1 ? [rest.slice(0, fs1.len), fs1.text] : null;
  if (tm && /,\s*\d+\s*\(|,\s*\d+,\s*[A-Za-z]?\d/.test(rest.slice(fs1.len))) return []; // looks like a journal entry we can't read reliably
  // book, report, web page: the title
  let t = tm ? tm[1] : rest;
  t = t.replace(/[.]$/, "").replace(/\s*\[[^\]]*\]\s*$/, "");
  const cut = t.search(/ [(\[][^()\[\]]*(?:Report|Policy|Working|EdWorkingPaper|NBER|Technical|Publication|Issue|Data set|Fact sheet|Press release|Brief|Doctoral|Master|Unpublished|Paper|No\.|Vol\.|ed\.|\d)[^()\[\]]*[)\]]?$/i);
  if (cut > 0) t = t.slice(0, cut);
  if (t.length < 3) return [];
  return [{ s: restStart, e: restStart + t.length, what: "title" }];
}
function looksTitleCase(title) {
  const words = String(title || "").split(/\s+/);
  let caps = 0, n = 0;
  words.forEach((w, i) => {
    const prev = words[i - 1] || "";
    if (i === 0 || /[:?!]$/.test(prev)) return;
    const core = w.replace(/^[“"‘'(]+|[”"’'),.;:?!]+$/g, "");
    const FUNC = /^(the|and|of|in|on|for|to|an|with|at|by|from|into|or|but|as|vs)$/i;
    if ((core.length < 4 && !FUNC.test(core)) || /^[A-Z0-9][A-Z0-9&.\-–]+$/.test(core)) return;
    n++; if (/^[A-Z]/.test(core)) caps++;
  });
  return (n >= 3 && caps === n) || (n >= 4 && caps / n > 0.8);
}
const DOI_BAD = /(?:\bdoi:\s*|https?:\/\/dx\.doi\.org\/|http:\/\/doi\.org\/|(?<![\/\w])DOI\s+)(10\.\d{4,9}\/[^\s]+?)(?=[.,;]?(?:\s|$))/gi;

function styleCheck(dom, result) {
  const W = result.entries.map(e => ({ e, text: paraText(e.p) }));
  const out = { italics: [], titleCase: [], doi: [], order: null, etal: [], amp: [], parenOrder: [], firstUse: [], quotes: [] };
  // reference list
  for (const { e, text } of W) {
    for (const t of italicTargets(text)) if (!rangeIsItalic(e.p, t.s, t.e)) out.italics.push({ entry: e, s: t.s, e: t.e, what: t.what, part: text.slice(t.s, t.e) });
    if (e.ref.type !== "legal" && looksTitleCase(e.ref.title)) out.titleCase.push({ entry: e, title: e.ref.title });
    for (const m of text.matchAll(DOI_BAD)) out.doi.push({ entry: e, s: m.index, e: m.index + m[0].length, from: m[0], to: "https://doi.org/" + m[1] });
  }
  const keyed = W.map(({ e }) => { const r = Object.assign({}, e.ref, { _suffix: e.ref.suffix }); return { e, k: sortKey(r) }; });
  const wrong = keyed.filter((x, i) => i > 0 && x.k.localeCompare(keyed[i - 1].k) < 0);
  if (wrong.length) out.order = { count: wrong.length, examples: wrong.slice(0, 5).map(x => x.e) };
  // in-text citations
  const byId = new Map(result.entries.map(e => [e.id, e]));
  const seenOrg = new Set();
  const bodyPs = readDocument(dom).bodyParas, offs = new Map(); let acc = 0;
  for (const bp of bodyPs) { offs.set(bp, acc); acc += paraText(bp).length + 1; }
  const bodyText = norm(bodyPs.map(paraText).join("\n"));
  const defPos = (org, abbr) => { const xs = [`${org} (${abbr}`, `${org} [${abbr}]`].map(f => bodyText.indexOf(norm(f))).filter(i => i >= 0); return xs.length ? Math.min(...xs) : -1; };
  for (const { p, spans } of result.perPara) {
    const groups = new Map();
    for (const sp of spans) {
      const [, , id, , , meta] = sp;
      const ent = byId.get(id); if (!ent || !meta) continue;
      const a = ent.ref.authors || [];
      const person = a.length && !a[0].org && ent.ref.type !== "legal";
      const ctx = paraText(p).slice(Math.max(0, (meta.ns ?? sp[0]) - 40), sp[1] + 20);
      if (a[0] && a[0].org && a[0].abbr && meta.first) {
        if (!seenOrg.has(id + a[0].org)) {
          const firstOfOrg = ![...seenOrg].some(k => k.endsWith(a[0].org));
          const here = (offs.get(p) || 0) + sp[1];
          const dp = defPos(a[0].org, a[0].abbr);
          if (firstOfOrg && norm(meta.name) === a[0].abbr && (dp < 0 || dp > here)) out.firstUse.push({ p, entry: ent, name: meta.name, abbr: a[0].abbr, org: a[0].org, context: ctx });
          seenOrg.add(id + a[0].org);
        }
      }
      if (!meta.first || !person) continue;
      const nm = meta.name;
      if (a.length >= 3 && !/et al\./.test(nm) && /,| & | and /.test(nm)) out.etal.push({ p, ns: meta.ns, ne: meta.ne, from: nm, to: a[0].family + " et al.", context: ctx });
      else if (meta.narr && / & /.test(nm)) out.amp.push({ p, ns: meta.ns, ne: meta.ne, from: nm, to: nm.replace(/ & /g, " and "), context: ctx, rule: "Use “and” in running text" });
      else if (!meta.narr && / and /.test(nm)) out.amp.push({ p, ns: meta.ns, ne: meta.ne, from: nm, to: nm.replace(/ and /g, " & "), context: ctx, rule: "Use “&” inside parentheses" });
      if (!meta.narr) { if (!groups.has(meta.group)) groups.set(meta.group, []); groups.get(meta.group).push(ent); }
    }
    for (const [g, ents] of groups) {
      if (ents.length < 2) continue;
      const ks = ents.map(en => sortKey(Object.assign({}, en.ref, { _suffix: en.ref.suffix })));
      if (ks.some((k, i) => i > 0 && k.localeCompare(ks[i - 1]) < 0)) {
        const t = paraText(p); const close = t.indexOf(")", g);
        out.parenOrder.push({ p, context: t.slice(g, close + 1) });
      }
    }
  }
  // quotations without page numbers
  for (const p of readDocument(dom).bodyParas) {
    const t = paraText(p);
    for (const q of t.matchAll(/[“"]([^”"]{12,}?)[”"]/g)) {
      if (q[1].trim().split(/\s+/).length < 4) continue;
      const after = t.slice(q.index + q[0].length, q.index + q[0].length + 140);
      const before = t.slice(Math.max(0, q.index - 160), q.index);
      const hasPage = /\((?:[^()]*?,\s*)?(?:pp?\.|paras?\.|chap\.|sec\.|Slide)\s*\d/.test(after.split(/(?<=\.)\s/)[0] + after.slice(0, 60)) || /\((?:[^()]*?,\s*)?(?:pp?\.|paras?\.)\s*\d/.test(before.slice(-60));
      if (!hasPage) out.quotes.push({ p, quote: q[1].length > 90 ? q[1].slice(0, 90) + "…" : q[1], context: t.slice(Math.max(0, q.index - 30), q.index + q[0].length + 40) });
    }
  }
  out.total = out.italics.length + out.titleCase.length + out.doi.length + (out.order ? out.order.count : 0) + out.etal.length + out.amp.length + out.parenOrder.length + out.firstUse.length + out.quotes.length;
  return out;
}

// Apply the chosen style fixes, plus confirmed citation corrections, to a fresh document. Returns counts.
function applyStyleFixes(dom, opts) {
  let res = checkDocument(dom, []);
  const done = { citations: 0, etal: 0, amp: 0, italics: 0, doi: 0, order: 0 };
  const sty = styleCheck(dom, res);
  // text edits per paragraph, applied right to left
  const edits = new Map();
  const add = (p, s, e, t, kind) => { if (!edits.has(p)) edits.set(p, []); edits.get(p).push([s, e, t, kind]); };
  if (opts.fixes && opts.fixes.length) {
    for (const f of opts.fixes) {
      const miss = res.misses[f.missIndex], entry = res.entries.find(x => x.id === f.entryId);
      if (!miss || !entry || !miss.p) continue;
      if (entry.year !== miss.years) add(miss.p, miss.ys, miss.ye, entry.year, "citations");
      if (!entry.forms.map(norm).includes(norm(miss.name))) add(miss.p, miss.ns, miss.ne, pickForm(entry, miss), "citations");
    }
  }
  if (opts.etal) for (const x of sty.etal) add(x.p, x.ns, x.ne, x.to, "etal");
  if (opts.amp) for (const x of sty.amp) add(x.p, x.ns, x.ne, x.to, "amp");
  if (opts.doi) for (const x of sty.doi) add(x.entry.p, x.s, x.e, x.to, "doi");
  const counted = new Set();
  for (const [p, list] of edits) {
    list.sort((a, b) => b[0] - a[0]);
    for (const [s, e, t, kind] of list) if (replaceRange(dom, p, s, e, t)) { done[kind]++; }
  }
  if (opts.italics) {
    res = checkDocument(dom, []);
    for (const e of res.entries) {
      const text = paraText(e.p);
      const ts = italicTargets(text);
      if (ts.some(t => !rangeIsItalic(e.p, t.s, t.e))) { setItalic(dom, e.p, ts[0].s, ts[ts.length - 1].e); done.italics++; }
    }
  }
  if (opts.order) {
    res = checkDocument(dom, []);
    const ps = res.entries.map(e => ({ p: e.p, k: sortKey(Object.assign({}, e.ref, { _suffix: e.ref.suffix })) }));
    const sortedPs = ps.slice().sort((a, b) => a.k.localeCompare(b.k));
    if (sortedPs.some((x, i) => x !== ps[i]) && ps.length) {
      const parent = ps[0].p.parentNode;
      const anchor = ps[ps.length - 1].p.nextSibling;
      if (ps.every(x => x.p.parentNode === parent)) {
        for (const x of ps) parent.removeChild(x.p);
        for (const x of sortedPs) parent.insertBefore(x.p, anchor);
        done.order = ps.filter((x, i) => sortedPs[i] !== x).length;
      }
    }
  }
  return done;
}
if (false) module.exports = { styleCheck, applyStyleFixes, italicTargets, looksTitleCase };

// Your exact wording, with APA 7 italics and DOI form applied: italics go exactly where APA puts them
function apaWording(html) {
  const d = typeof document !== "undefined" ? document.createElement("div") : null;
  let text;
  if (d) { d.innerHTML = html; text = d.textContent; } else text = String(html).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, " ").trim()
    .replace(/(?:\bdoi:\s*|https?:\/\/dx\.doi\.org\/|http:\/\/doi\.org\/)(10\.\d{4,9}\/\S+)/gi, "https://doi.org/$1");
  const t = italicTargets(text);
  if (!t.length) return html; // couldn't read this entry's parts reliably; keep it as written
  t.sort((a, b) => a.s - b.s);
  for (let i = t.length - 1; i > 0; i--) if (/^,\s*$/.test(text.slice(t[i - 1].e, t[i].s))) { t[i - 1] = { s: t[i - 1].s, e: t[i].e, what: "journal" }; t.splice(i, 1); }
  let out = "", at = 0;
  for (const x of t) { out += esc(text.slice(at, x.s)) + "<i>" + esc(text.slice(x.s, x.e)) + "</i>"; at = x.e; }
  return out + esc(text.slice(at));
}
