// ===== Online lookup (standalone build): Crossref for DOIs, Open Library for ISBNs =====
const ONLINE_LOOKUP = true;
function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
function capFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function sentenceCase(t) {
  return String(t || "").split(/(:\s+|\?\s+|—\s*)/).map((seg, i) => {
    if (i % 2) return seg;
    return seg.split(" ").map((w, j) => (/^[A-Z0-9][A-Z0-9&.\-–]+s?$/.test(w) && /[A-Z].*[A-Z]|[0-9]/.test(w)) ? w : j === 0 ? capFirst(w.toLowerCase()) : w.toLowerCase()).join(" ");
  }).join("");
}
function parseLookupInput(s) {
  s = String(s || "").trim();
  const doi = s.match(/10\.\d{4,9}\/[^\s"<>]+/);
  if (doi) return { kind: "doi", value: doi[0].replace(/[.,;)]+$/, "") };
  const digits = s.replace(/[^0-9Xx]/g, "");
  if (/^(97[89])?\d{9}[\dXx]$/.test(digits)) return { kind: "isbn", value: digits.toUpperCase() };
  return null;
}
function crossrefToItem(m) {
  const T = { "journal-article": "article", "book": "book", "monograph": "book", "edited-book": "book", "reference-book": "book", "book-chapter": "chapter", "book-section": "chapter", "report": "report", "posted-content": "report", "dissertation": "report", "proceedings-article": "chapter" };
  const it = { type: T[m.type] || "other", tags: [] };
  it.authors = (m.author || []).map(a => a.family ? { family: a.family, given: initials(a.given || "") } : { org: a.name || "" }).filter(a => a.family || a.org);
  const dp = (m.issued || m["published-print"] || m["published-online"] || m.created || {})["date-parts"];
  if (dp && dp[0] && dp[0][0]) it.year = String(dp[0][0]);
  let title = stripTags((m.title || [])[0]);
  const sub = stripTags((m.subtitle || [])[0]);
  if (sub && !title.toLowerCase().includes(sub.toLowerCase())) title += ": " + capFirst(sub);
  it.title = title;
  const cont = stripTags((m["container-title"] || [])[0]);
  if (cont) it.container = cont;
  if (m.volume) it.volume = String(m.volume);
  if (m.issue) it.issue = String(m.issue);
  if (m.page) it.pages = String(m.page).replace(/-+/, "–");
  if (["book", "chapter", "report"].includes(it.type) && m.publisher) it.publisher = m.publisher;
  if (m.editor && m.editor.length) it.editors = m.editor.map(e => e.family ? (initials(e.given || "") + " " + e.family).trim() : e.name).join(m.editor.length === 2 ? " & " : ", ").replace(/, ([^,]+)$/, m.editor.length > 2 ? ", & $1" : ", $1");
  if (m.DOI) it.doi = m.DOI;
  if (it.type === "report" && m.type === "posted-content" && m.institution && m.institution[0] && m.institution[0].name) it.publisher = m.institution[0].name;
  return it;
}
async function lookupDOI(doi) {
  let r;
  try { r = await fetch("https://api.crossref.org/works/" + encodeURIComponent(doi)); }
  catch { throw new Error("Couldn't reach Crossref. Check your internet connection."); }
  if (r.status === 404) throw new Error("Crossref has no record of that DOI. Check it for typos.");
  if (!r.ok) throw new Error("Crossref didn't answer. Try again in a minute.");
  const j = await r.json();
  return crossrefToItem(j.message || {});
}
async function lookupISBN(isbn) {
  let r;
  try { r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`); }
  catch { throw new Error("Couldn't reach Open Library. Check your internet connection."); }
  if (!r.ok) throw new Error("Open Library didn't answer. Try again in a minute.");
  const j = await r.json();
  const b = j["ISBN:" + isbn];
  if (!b) throw new Error("Open Library has no record of that ISBN.");
  const it = { type: "book", tags: [] };
  it.title = stripTags(b.title) + (b.subtitle ? ": " + capFirst(stripTags(b.subtitle)) : "");
  it.authors = (b.authors || []).map(a => splitPersonName(a.name)).filter(Boolean);
  const y = String(b.publish_date || "").match(/(1[5-9]|20)\d\d/); if (y) it.year = y[0];
  if (b.publishers && b.publishers[0]) it.publisher = b.publishers[0].name;
  return it;
}
async function lookupAny(s) {
  const q = parseLookupInput(s);
  if (!q) throw new Error("That doesn't look like a DOI (10.xxxx/…) or an ISBN.");
  return q.kind === "doi" ? lookupDOI(q.value) : lookupISBN(q.value);
}
