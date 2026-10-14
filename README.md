# Citekeep
Citekeep
A free, private reference manager for Windows, built for writers who type their own citations.
Citekeep supports:
- APA 7
- MLA 9
- Chicago 18
  - Author-date
  - Notes and bibliography
Most reference managers only understand citations inserted through their Word plugin. Citekeep works the other way around: open any Word document and it reads the citations you typed, checks them against the reference list, and fixes what it can.
See [`CHANGELOG.md`](CHANGELOG.md) for what changed in each version.
Provided as is, without warranty or support. It works for its author and may work for you.
MIT License.

What It Does
Word documents and citation checking
Open a Word document and its references can go into your library—or not, if you are checking a student's paper.
Recent documents are listed for one-click re-checks.
Citekeep checks citations against the reference list for:
- Missing reference entries
- Uncited reference entries
- Near-miss spellings, such as “Is this the reference you meant?”
- et al. errors
- Ampersand errors
- APA 7 italics
You can save a corrected copy with every in-text citation linked to its reference. In Word, use Ctrl+click to jump from the citation to the reference.
Citekeep can also optionally rebuild the reference list:
- Cited entries only
- Alphabetized
- Italics fixed
- Missing entries added from your library
You can also check several chapters at once against one combined reference list.
Claim checking against PDFs
Citekeep can check claims against your PDFs.
For each sentence that cites a source, AI reads the relevant passages of that source's PDF and reports whether they support the sentence.
Each verdict:
- Quotes the supporting or conflicting passage
- Gives the page number
- Ignores abstracts as evidence
Verdicts are saved between sittings, and the report can be saved as a Word file.
Retraction alerts
Citekeep checks Crossref for retraction information.
PDF management
Link a PDF folder and Citekeep matches each PDF to its reference using:
- The DOI printed inside the PDF
- The title on the first page
File names do not matter.
Citekeep can also:
- Find free, legal copies through Unpaywall
- Search inside your PDFs
- Watch your Downloads folder
- File and link PDFs you download
- Add new references for articles it can identify
Literature matrix
Citekeep includes a literature matrix with one row per reference.
Fields include:
- Author(s)
- Sample
- Methodology
- Theoretical Framework / Constructs
- Design / Data Analysis
- Findings
You can:
- Import an existing matrix from Word
- Save the matrix to Word
- Optionally have AI draft rows from your PDFs for you to review
The AI can be:
- A program running on your own computer, free and private
- LM Studio
- Ollama
- Jan
- GPT4All
- llama.cpp
- KoboldCpp
- Any other OpenAI-compatible local server
- Claude API using your own key
Reference lists and exports
Citekeep creates reference lists in:
- APA 7
- MLA 9 Works Cited
- Chicago 18 References
- Chicago 18 Bibliography
Reference order can be adjusted by dragging.
You can also export to:
- RIS
- BibTeX
for use in Zotero and other reference managers.
MLA and Chicago citation checking
Typed citations are checked in the paper's own style, detected automatically.
Examples include:
- MLA: (Smith 45)
- MLA with two works by one author, distinguished by short title
- Chicago author-date: (Smith 2020, 45)
- Chicago footnotes
- Chicago short notes
- Ibid.
- Bibliography matching
Formatting fixes such as italics, capitalization, and reference-order corrections are currently APA-only.
Moving between computers
You can move Citekeep between computers by:
- Exporting one transfer file, or
- Keeping your library in a Google Drive, OneDrive, or Dropbox folder
Both computers can be open at the same time.
Citekeep merges changes rather than overwriting them:
- A reference changed on both computers keeps both versions for you to choose between
- A work added on both computers is kept only once
Each computer keeps its own:
- PDF folder
- AI settings
Daily backups are kept automatically.
Optional Citekeep password
You can optionally protect sensitive settings with a Citekeep password.
The following can be stored encrypted with AES-256:
- Claude API key
- Google sign-in
- Local AI key
They are unlocked with your password when Citekeep opens.
A one-time recovery code can unlock them if you forget the password.
There are:
- No accounts
- No email password reset
- No way for the author or anyone else to recover your password
Without a password, keys stay on each computer and never sync.
AI on another computer
You can point Citekeep at LM Studio or Ollama running on another computer on your home network.
Built-in help
A Help tab inside the app walks through each task.
All setup lives on the Settings tab.
Current Platform and Formatting Support
- Windows only
- APA 7 formatting fixes only
MLA 9 and Chicago 18 citation checking are supported, but automated formatting corrections such as italics, capitalization, and reference-order fixes are currently APA-only.
Install
Download Citekeep Setup from the Releases page and run it.
Windows will probably show:
Windows protected your PC

because the installer is not code-signed.
Click:
More info → Run anyway
Citekeep installs for your Windows account only. No administrator password is required.
To update, run the newer installer.
Your library is never touched.
Where Your Data Lives
Everything is stored locally in:
Documents\Citekeep

Your data includes:
library.json

Your reference library.
settings.json

Your settings.
backups

Daily backups.
Citekeep has no account and no server.
Nothing is uploaded except the lookups you explicitly request:
- Crossref — DOIs and retractions
- Open Library — ISBNs
- Unpaywall — free PDFs
- The AI service you choose, if you use AI drafting
Optional Setup
Google Drive
Create your own Google Cloud OAuth client.
The step-by-step guide is inside Citekeep under:
Settings → Your PDFs → Google Drive setup
Be sure to add your own Gmail address as a test user. Otherwise, Google may show:
Access blocked: … has not completed the Google verification process.

Signing in allows Citekeep to:
- See your Drive files' names and links
- Match Drive PDFs by name
- Save a .txt list of any Drive folder
It does not read the contents of your Drive files through this connection.
If you use Google Drive for desktop, you can instead point Citekeep's PDF folder at your synced Drive folder and get the same file access without signing in.
AI drafting
Go to:
Settings → AI drafting
Choose your AI program:
- LM Studio
- Ollama
- Jan
- GPT4All
- llama.cpp
- KoboldCpp
- Any OpenAI-compatible local server
- Claude API
Programs that are currently running are marked.
Load your model with a context length of 32,768 or more. Citekeep asks Ollama for this directly.
Then click Test connection.
Setup instructions for each program appear under the drop-down.
The instructions sent to the AI can also be edited there.
Building From Source
The full source is included in this repository.
See [`BUILDING.md`](BUILDING.md) for:
- Build instructions
- Code organization
- Notes on porting Citekeep to macOS or Linux
Credits
Built with:
- Neutralinojs — MIT
- PDF.js — Apache 2.0
- JSZip — MIT
See [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).
