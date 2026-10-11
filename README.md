# Citekeep

A free, private reference manager for Windows, built for APA 7 writers who type their own citations.

Most reference managers only understand citations you insert through their Word plugin. Citekeep works the other way around: open any Word document and it reads the citations you typed, checks them against the reference list, and fixes what it can.

**Provided as is, without warranty or support.** It works for its author and may work for you. MIT License.

## What it does

- **Open a Word document** and every reference in its list goes into your library.
- **Check citations against the reference list**: missing entries, uncited entries, near-miss spellings ("is this the reference you meant?"), *et al.* and ampersand errors, and APA 7 italics.
- **Save a corrected copy** with every in-text citation linked to its reference (Ctrl+click in Word). Optionally rebuild the reference list: cited entries only, alphabetized, italics fixed, missing entries added from your library.
- **Check several chapters at once** against one combined reference list.
- **Retraction alerts** from Crossref.
- **Your PDFs**: link a PDF folder and Citekeep matches each PDF to its reference by the DOI printed inside it or the title on its first page, so file names don't matter. It also:
  - finds free, legal copies through Unpaywall
  - searches inside your PDFs
  - watches your Downloads folder, filing and linking the PDFs you download and adding new references for articles it can identify
- **Literature matrix**: one row per reference (Author(s), Sample, Methodology, Theoretical Framework / Constructs, Design / Data Analysis, Findings). Import an existing matrix from Word, save it to Word, and optionally have AI draft rows from your PDFs for you to review. The AI can be [LM Studio](https://lmstudio.ai) running on your own computer (free, private) or the Claude API with your own key.
- **Reference lists** in APA 7, with the order adjustable by dragging; export to RIS and BibTeX for Zotero and others.
- **Moving computers**: export one transfer file, or keep your library in a Google Drive, OneDrive or Dropbox folder to share it between computers. Daily backups are kept automatically.

APA 7 only. Windows only.

## Install

1. Download **Citekeep Setup** from the Releases page and run it.
2. Windows will probably show **"Windows protected your PC"** because the installer isn't code-signed. Click **More info**, then **Run anyway**.
3. Citekeep installs for your Windows account only; no administrator password is needed.

To update, run the newer installer. Your library is never touched.

## Where your data lives

Everything is kept in **Documents\Citekeep** on your computer:
- your library, in `library.json`
- your settings, in `settings.json`
- daily backups, in the `backups` folder

Citekeep has no account and no server; nothing is uploaded except the lookups you ask for:
- Crossref, for DOIs and retractions
- Open Library, for ISBNs
- Unpaywall, for free PDFs
- the AI service you choose, if you use AI drafting

## Optional setup

- **Google Drive PDFs**: create your own Google Cloud OAuth client (the steps are in the app under Import & export → Your PDFs → Google Drive setup).
- **AI drafting**: in LM Studio, start the server, turn on **Enable CORS**, and load your model with a context length of 32768 or more. Then click Test connection on the Matrix tab. The instructions given to the AI can be edited there.

## Credits

Built with [Neutralinojs](https://neutralino.js.org) (MIT), [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) and [JSZip](https://stuk.github.io/jszip/) (MIT). See `THIRD-PARTY-NOTICES.txt`.
