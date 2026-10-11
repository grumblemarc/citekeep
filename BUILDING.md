# Building Citekeep

Citekeep is a web app (HTML, CSS and plain JavaScript, no framework) running inside [Neutralinojs](https://neutralino.js.org), a small engine that shows the app in the system's web view and gives it access to files and the operating system. Released builds are Windows-only, but nearly all of the code is platform-neutral; see **Porting** below.

## What you need

- [Node.js](https://nodejs.org) 18 or newer
- The Neutralino command-line tool, installed by `npm install` below (or globally with `npm install -g @neutralinojs/neu`)
- For the Windows installer only: [NSIS](https://nsis.sourceforge.io) (`makensis`). It runs on Windows, Linux (`apt install nsis`) and macOS (`brew install makensis`).

## Build

```
git clone https://github.com/grumblemarc/citekeep.git
cd citekeep
npm install                # installs the neu build tool
npm run setup              # downloads the Neutralino engine into app/bin (once)
npm run dev                # builds and opens Citekeep in a window, for trying changes
npm run app                # builds the release files into app/dist/Citekeep
npm run package:windows    # builds and makes installer/windows/Citekeep Setup Vxx.exe
```

`node build.js` assembles `app/resources/index.html` from the files in `src/` (it's the only generated file; don't edit it by hand). The version number comes from `"version"` in `app/neutralino.config.json`; raise the first number for each release, and the app, the installer and the updater all follow it.

## How the code is organized

| File | What it does |
|---|---|
| `src/shell.html` | The page: layout, styles and every tab's markup |
| `src/core.js` | Reads Word files, parses APA references, matches typed citations, links citations to references |
| `src/style.js` | APA 7 checks and fixes, including italics |
| `src/lookup.js` | DOI (Crossref) and ISBN (Open Library) lookups |
| `src/app.js` | The library, reference editor, document check, reference list, import/export, saving |
| `src/extras.js` | Retraction alerts, multi-document check, hand-ordered reference lists |
| `src/matrix.js` | Literature matrix, Word import/export, AI drafting (LM Studio or Claude API) |
| `src/pdfs.js` | The PDF folder, reading PDFs (pdf.js), matching PDFs to references, Google Drive sign-in |
| `src/pdfget.js` | Free PDFs via Unpaywall, title search, the Downloads watch |
| `src/datacard.js` | Data location, daily backups, transfer files, updates |
| `src/zotgaps.js` | Add from PDF, rebuild a reference list, search inside PDFs, duplicates, tag folders |
| `src/claims.js` | Claim check: does the cited PDF support each sentence |
| `src/drivelist.js` | Saves a list of a Google Drive folder |
| `src/platform-neutralino.js` | **The only file that talks to the operating system.** It defines `window.citekeepApp`: library and settings files, folders, opening files, Google sign-in, updates |
| `vendor/jszip.min.js` | JSZip, for reading and writing .docx files |
| `app/` | Neutralino project: `neutralino.config.json`, icon, Google sign-in page, Neutralino client and pdf.js |
| `installer/windows/` | NSIS installer script and icon |

User data lives in `Documents/Citekeep` (library.json, settings.json, pdf-index.json, pdf-text.json, claims.json, backups/). A `location.json` there can point to a shared folder instead.

## Porting to macOS or Linux

Neutralino runs on macOS and Linux, and `npm run setup` already downloads those engines (`app/bin/neutralino-mac_universal`, `neutralino-linux_x64`, and others). What's Windows-specific is small:

1. **Updates** (`src/platform-neutralino.js`):
   - `updateCheck` and `updateDownload` call `curl.exe`. macOS and most Linux systems have `curl`; use `NL_OS` to pick the name.
   - `updateRun` starts the installer with `start "" "<path>"`. On macOS, open the downloaded .dmg with `open "<path>"`. On Linux, open the download folder or install the package.
   - The updater looks for a release file matching `setup.*\.exe`; change that to your platform's file name.
   - `UPDATE_REPO` at the top names the GitHub repository to check. Forks should change it.
2. **Packaging.** Replace the NSIS installer with:
   - **macOS:** a `Citekeep.app` bundle containing the Mac engine and `resources.neu`, distributed as a .dmg or .zip. See Neutralino's [distribution guide](https://neutralino.js.org/docs/distribution/overview). Without an Apple Developer account ($99/year) for signing and notarization, users must right-click and choose Open the first time.
   - **Linux:** an AppImage or .deb, or simply a folder holding the engine and `resources.neu`.
3. **Closing the app before updating** is handled by the Windows installer (`installer/windows/citekeep.nsi`). On other systems, quit the app before replacing it.
4. **Wording.** The Help tab (`src/shell.html`), a few messages in `src/datacard.js` and the README say "Documents\Citekeep" and mention Windows' "Windows protected your PC" prompt.

Everything else is platform-neutral and should work unchanged:
- file paths (`join()` in the platform file handles `\` and `/`)
- the Documents and Downloads folders
- PDF reading, Google Drive, LM Studio (which runs well on Apple Silicon), the Claude API, Crossref and Unpaywall

macOS uses WebKit rather than Edge's engine, so give the layout and file dialogs a once-over.

## Contributing

Pull requests are welcome, but Citekeep is offered as is, and there's no promise of review or support. Keep it APA 7-first, keep user data local, and never source matrix findings from abstracts.

## License

MIT (see `LICENSE.txt`). Third-party components and their licenses are listed in `THIRD-PARTY-NOTICES.txt`.
