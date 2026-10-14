# Citekeep
A free, private reference manager for Windows, built for writers who type their own citations: APA 7, MLA 9, and Chicago 18 (author-date or notes and bibliography).
Most reference managers only understand citations you insert through their Word plugin. Citekeep works the other way around: open any Word document and it reads the citations you typed, checks them against the reference list, and fixes what it can.
What changed in each version: CHANGELOG.md.
Provided as is, without warranty or support. It works for its author and may work for you. MIT License.
What it does
Open a Word document and its references can go into your library (or not, for a student's paper). Recent documents are listed for one-click re-checks.
Check citations against the reference list: missing entries, uncited entries, near-miss spellings ("is this the reference you meant?"), et al. and ampersand errors, and APA 7 italics.
Save a corrected copy with every in-text citation linked to its reference (Ctrl+click in Word). Optionally rebuild the reference list: cited entries only, alphabetized, italics fixed, missing entries added from your library.
Check several chapters at once against one combined reference list.
Check claims against your PDFs: for each sentence that cites a source, AI reads the relevant passages of that source's PDF and reports whether they support the sentence. Each verdict quotes the passage and gives its page. Abstracts don't count as support. Verdicts are saved between sittings, and the report can be saved as a Word file.
Retraction alerts from Crossref.
Your PDFs: link a PDF folder and Citekeep matches each PDF to its reference by the DOI printed inside it or the title on its first page, so file names don't matter. It also:
finds free, legal copies through Unpaywall
searches inside your PDFs
watches your Downloads folder, filing and linking the PDFs you download and adding new references for articles it can identify
Literature matrix: one row per reference (Author(s), Sample, Methodology, Theoretical Framework / Constructs, Design / Data Analysis, Findings). Import an existing matrix from Word, save it to Word, and optionally have AI draft rows from your PDFs for you to review. The AI can be a program running on your own computer (free, private), such as LM Studio or Ollama, or the Claude API with your own key.
Reference lists in APA 7, MLA 9 (Works Cited) or Chicago 18 (References or Bibliography), with the order adjustable by dragging; export to RIS and BibTeX for Zotero and others.
MLA and Chicago papers: typed citations are checked in the paper's own style, detected automatically: (Smith 45) in MLA, including two works by one author told apart by short title; (Smith 2020, 45) in Chicago author-date; and Chicago footnotes, including short notes and Ibid., matched to the bibliography. Formatting fixes (italics, capitalization, order) are APA-only for now.
Moving computers: export one transfer file, or keep your library in a Google Drive, OneDrive or Dropbox folder to share it between computers. Both computers can be open at once: Citekeep merges what each one changed, never overwrites (a reference changed on both keeps both versions for you to choose), and keeps a work added on both only once. Each computer keeps its own PDF folder and AI settings. Daily backups are kept automatically.
Citekeep password (optional): your Claude API key, Google sign-in and local AI key are stored encrypted (AES-256) and unlocked with your password when Citekeep opens; a one-time recovery code unlocks them if you forget it. There are no accounts and no password reset by email: nobody, including the author, can recover the password. Without a password, keys stay on each computer and never sync.
AI on another computer: point Citekeep at LM Studio or Ollama running on another computer on your home network.
A Help tab inside the app walks through each task, and all setup lives on the Settings tab.
APA 7 only. Windows only.
Install
Download Citekeep Setup from the Releases page and run it.
Windows will probably show "Windows protected your PC" because the installer isn't code-signed. Click More info, then Run anyway.
Citekeep installs for your Windows account only; no administrator password is needed.
To update, run the newer installer. Your library is never touched.
Where your data lives
Everything is kept in Documents\Citekeep on your computer:
your library, in `library.json`
your settings, in `settings.json`
daily backups, in the `backups` folder
Citekeep has no account and no server; nothing is uploaded except the lookups you ask for:
Crossref, for DOIs and retractions
Open Library, for ISBNs
Unpaywall, for free PDFs
the AI service you choose, if you use AI drafting
Optional setup
Google Drive: create your own Google Cloud OAuth client. The step-by-step guide is in the app under Settings → Your PDFs → Google Drive setup. Be sure to add your own Gmail address as a test user; otherwise Google shows "Access blocked: … has not completed the Google verification process." Signing in lets Citekeep see your Drive files' names and links (not their contents), match Drive PDFs by name, and save a .txt list of any Drive folder. If you use Google Drive for desktop, pointing Citekeep's PDF folder at your synced Drive folder gives you everything without signing in.
AI drafting: in Settings → AI drafting, pick your AI program: LM Studio, Ollama, Jan, GPT4All, llama.cpp, KoboldCpp, any other OpenAI-compatible local server, or the Claude API. Programs that are running are marked. Load your model with a context length of 32768 or more (Citekeep asks Ollama for it directly), then click Test connection. Setting up under the drop-down has the steps for each program. The instructions given to the AI can be edited there.
Building from source
The full source is in this repository. See BUILDING.md for building, how the code is organized, and notes on porting to macOS or Linux.
Credits
Built with Neutralinojs (MIT), PDF.js (Apache 2.0) and JSZip (MIT). See `THIRD-PARTY-NOTICES.txt`.
Built with [Neutralinojs](https://neutralino.js.org) (MIT), [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) and [JSZip](https://stuk.github.io/jszip/) (MIT). See `THIRD-PARTY-NOTICES.txt`.
