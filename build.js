// Builds app/resources/index.html from the files in src/.
// Usage: node build.js
// The version shown in the app (e.g. "V30") comes from "version" in app/neutralino.config.json.
const fs = require("fs"), path = require("path");
const R = p => fs.readFileSync(path.join(__dirname, p), "utf8");

const config = JSON.parse(R("app/neutralino.config.json"));
const V = "V" + String(config.version).split(".")[0];

// Order matters: later files use functions from earlier ones.
const APP_FILES = [
  "src/core.js",        // reading Word files, parsing references, matching citations
  "src/style.js",       // APA 7 checks and fixes, italics
  "src/lookup.js",      // DOI (Crossref) and ISBN (Open Library) lookups
  "src/app.js",         // library, editor, document check, reference list, import/export
  "src/extras.js",      // retractions, multi-document check, reference-list ordering
  "src/matrix.js",      // literature matrix and AI drafting
  "src/pdfs.js",        // PDF folder, matching PDFs to references, Google Drive
  "src/pdfget.js",      // free PDFs (Unpaywall), title search, Downloads watch
  "src/datacard.js",    // data location, backups, transfer files, updates
  "src/zotgaps.js",     // add from PDF, rebuild reference list, PDF search, duplicates, tag folders
  "src/claims.js",      // claim check against PDFs
  "src/drivelist.js",   // list a Google Drive folder
];

const shell = R("src/shell.html");
const [styles, body] = [shell.split("</style>")[0], shell.split("</style>").slice(1).join("</style>")];

let html =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
  styles + "</style>\n<style>[hidden]{display:none!important}body{margin:0}</style></head><body>\n" +
  body +
  '\n<script src="/__neutralino_globals.js"></script>\n<script src="/js/neutralino.js"></script>\n<script src="/js/pdf.min.js"></script>\n' +
  "<script>\n" + R("src/platform-neutralino.js") + "\n</script>\n" +
  "<script>\n" + R("vendor/jszip.min.js") + "\n</script>\n" +
  "<script>\n" + APP_FILES.map(R).join("\n") + "\n</script>\n</body></html>\n";

html = html
  .replace('<div class="brand">Citekeep<small>APA 7</small></div>', `<div class="brand">Citekeep<small>${V} · APA 7</small></div>`)
  .replace("<title>Citekeep</title>", `<title>Citekeep ${V}</title>`);

fs.writeFileSync(path.join(__dirname, "app/resources/index.html"), html);
console.log(`Built app/resources/index.html (Citekeep ${V}, ${Math.round(html.length / 1024)} KB)`);
