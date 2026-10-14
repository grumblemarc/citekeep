# Changelog

What changed in each version of Citekeep, newest first. Every version installs over the one before it; your library and settings in Documents\Citekeep are kept.

## V49 (2026-10-14)
- **Ask the AI about source kinds without clear evidence**: in Library → Source kinds, one button sends each of those references (and the start of its file, if linked) to your AI program. It must quote the words that show the kind; Citekeep checks that the quote is really in the text and sets the answer aside if not. AI suggestions are marked as such, and nothing is saved until you click Save.

## V48 (2026-10-14)
- **Write shows what the AI program is doing while you wait**, with a running timer: reading what it was sent (with the number of words), thinking before it writes, or writing. A local model can take minutes to read a long paper before its first word; now that looks like progress instead of a stall. Each answer shows how long it took.
- When an AI program doesn't send answers word by word, Write says so while it waits for the whole answer.

## V47 (2026-10-14)
- **Attach files to a Write chat**: click **Attach files** or drop them on the chat. PDF, Word, Excel, PowerPoint, and text files (.txt, .md, .csv and others). Their text goes to the AI with your message, ahead of the library sources, and they stay with that chat until you remove them. Older .doc, .xls and .ppt files need saving in the newer format first; scanned PDFs without text can't be read.

## V46 (2026-10-14)
- **Write**: a chat with your AI program, and Citekeep's opening screen. Ask for drafts, outlines, literature review sections, thesis statements, summaries or revisions.
  - **Sources** for each chat: your whole library, a tag, a source kind, one of your categories, or references you pick. The AI gets their references, your matrix notes, and as much of the linked files' text as fits.
  - Answers appear as they're written, with **Stop**, **Copy**, **Regenerate** and **Save as Word** (with a reference list of the works cited, in your citation style).
  - The sources an answer cites are listed under it; a citation that matches nothing in your library is underlined.
  - Chats are kept in Citekeep's data folder, listed down the side.
  - Works with every AI program Citekeep supports, and the Claude API. Programs that block requests from apps answer all at once instead of word by word.
- **Opening screen** (Settings → Appearance): Write or Library. Clicking the Citekeep name goes there.
- Keyboard: Ctrl+1 to 8 for the tabs, with Write first.

## V45 (2026-10-14)
- **AnythingLLM** is now one of the AI programs (Settings → AI drafting). It answers through a workspace, so make an empty one just for Citekeep, and enter an API key from AnythingLLM's Developer API settings.
- Fixed: clicking Test connection while Citekeep was still checking which AI programs are running could cause an error.

## V44 (2026-10-13)
- **Source kinds** replace V43's categories: scholarly journal article, book or chapter, dissertation or thesis, conference paper, research report or working paper, government or school-system document, law or policy, and web page or news. They mean the same thing for everyone.
  - **Source kinds** in the Library checks each DOI with Crossref (the publisher's own record of what the work is), then reads the reference itself (a journal name and volume, "Doctoral dissertation", an ERIC document number, a government author or website), suggests a kind only where that evidence shows one, and says what each suggestion rests on. Nothing is saved until you click Save.
  - A journal article is the usual stand-in for peer reviewed, but Citekeep doesn't claim peer review: no free record of it exists for each article.
- **My categories**: none built in. Add your own in Settings → Sources and set them on a reference's page or several at once with Select. Citekeep never suggests them.
- V43's three built-in categories are removed, along with any references set to them.

## V43 (2026-10-13)
- **Word, Excel and PowerPoint files are linked as well as PDFs**, in your folder and your chosen Drive folders. Newer files (.docx, .xlsx, .pptx) are matched by the text inside them, like PDFs; older .doc, .xls and .ppt files and Google Docs, Sheets and Slides by their names. The Library shows which kind of file each reference has. Search inside files and the claim check read .docx, .xlsx and .pptx files too.
- Word's temporary "~$" files are ignored.
- A first version of categories (replaced in V44).

## V42 (2026-10-13)
- **Google Drive: only the folders you choose.** Citekeep used to list every PDF anywhere in your Google Drive, so the "Files not linked" list filled with unrelated files and matching had hundreds of extra files to weigh. Now it looks only in the Drive folder or folders you pick (Settings → Your PDFs → **Choose Drive folders**), subfolders included, and nowhere else. Until you choose one, no Drive PDFs are listed. PDFs already linked from Drive stay linked.
- "Files not linked to any reference" now says how many are in your PDF folder and how many are on Google Drive.

## V41 (2026-10-13)
- **PDFs that once failed to read are read again.** Citekeep used to remember a failed read and never retry that file, so some PDFs could stay unmatched for good. Failed reads are now retried every time, and **Read all PDFs again** (Settings → Your PDFs) starts fresh.
- **Why?** beside every unmatched PDF: what Citekeep read (pages, the title it found, any DOI) and how the closest references scored, with a **Link to this** button.
- **Close calls to decide**: when two files or two references fit almost equally, Citekeep no longer silently skips them; it lists them for you to choose.
- **Versions share a PDF**: a working paper and the article it became (same title and first author) both link to the one PDF you have.
- **Check existing links** finds PDFs linked to a reference they don't seem to be.
- A reference whose web address ends in a file name (…/Report_2022.pdf) matches the PDF with that name.

## V40 (2026-10-13)
- Fixed: Citekeep could start running but invisible, off the screen, if it had been closed while minimized. It no longer saves a minimized window's position, only returns to a place that's on a connected screen, and makes sure the window is shown. A bad saved position from V39 is cleared automatically.

## V39 (2026-10-13)
- **Your choice whether a paper's references go into your library**: untick "Add the paper's references to my library" to check a student's paper or a rough draft without filling your library. Remembered on each computer.
- **Undo and Trash**: deleting a reference shows Undo, and deleted references stay in the Trash for 30 days (Library → Trash) to restore or delete for good.
- **Recent documents**: documents you open are listed under the drop area with **Check again**, and Citekeep points out a newer version of the same file in its folder (Chapter_2_V.42 after V.41).
- **Library**: sort by author, newest or oldest, recently added, or title; **Select** several references to tag, untag or delete together.
- **Start here**: a three-step guide when the library is empty.
- **Settings cards fold away**: click a card's heading; remembered on each computer.
- **Keyboard**: Ctrl+F search, Ctrl+O open a document, Ctrl+N new reference, Ctrl+1 to 7 for the tabs, arrow keys to move through the Library, Esc to close a dialog. Reference lists can be reordered with ▲ and ▼ as well as by dragging.
- **Drop files anywhere**: a Word document opens for checking, and PDFs are added to your library.
- **The window opens where you left it**, at the same size, maximized if it was.
- **Clearer status for a shared library**: when it last synced, and when changes came in from your other computer.
- Confirmations and questions now appear in Citekeep's own style instead of Windows boxes.
- **What's new**: this changelog is in the Help tab, with a note after each update. CHANGELOG.txt is in Citekeep's program folder.

## V38 (2026-10-13)
- **Help tab rewritten and expanded to 12 cards**: new cards for citation styles, two computers and the password, appearance and updates, and troubleshooting; Google Drive, Crossref, Find my copy and the AI on another computer now covered; outdated APA-only wording fixed.

## V37 (2026-10-13)
- **Appearance** (Settings): light or dark or match Windows, six accent colors, and three text sizes. Kept on each computer.

## V36 (2026-10-13)
- **MLA 9 and Chicago 18**, alongside APA 7: Chicago author-date, and Chicago notes and bibliography.
  - Your usual style in Settings → Citation style; the Library shows references and citations in it, and the title bar names it.
  - Reference lists in any style: Works Cited, References or Bibliography, with each style's order, title case, page ranges and MLA's "---." for a repeated author.
  - Documents checked in their own style, detected automatically: MLA citations like (Smith 45), with short titles for an author's two works; Chicago author-date citations like (Smith 2020, 45); Chicago footnotes, including short notes and Ibid.
  - Saved copies link citations in any style, including inside footnotes. The claim check works in every style.
  - References that only had APA wording are formatted from the journal, volume and pages read out of it.
- Formatting fixes (italics, capitalization, order, rebuilding the list) remain APA-only.

## V35 (2026-10-12)
- **Citekeep password** (optional): encrypts the Claude API key, Google sign-in and local AI key (AES-256), asked for when Citekeep opens, with a one-time recovery code. Keys can now be shared safely between computers.
- Keys no longer sit in plain text in a shared settings file; without a password they stay on each computer.
- **AI on another computer at home**: point Citekeep at LM Studio or Ollama on your home network.
- Fixed: opening Citekeep without internet no longer signs you out of Google Drive.

## V34 (2026-10-12)
- **One library on two computers, open at the same time**: Google Drive (or OneDrive, Dropbox) carries the library, and Citekeep merges what each computer changed. Nothing is overwritten; a reference changed on both shows "2 versions" to choose from, and a work added on both is kept once. Drive's conflict copies are merged and set aside.
- The PDF folder and AI program address are now set on each computer separately.

## V33 (2026-10-12)
- **Choose your AI program**: LM Studio, Ollama, Jan, GPT4All, llama.cpp, KoboldCpp, any OpenAI-compatible server, or the Claude API. Running programs are detected and marked; each keeps its own address and model.
- Programs that block requests from apps (CORS) now work without changing their settings.

## V32 (2026-10-12)
- Fixed: Settings cards overflowing their borders in a narrow window.

## V31 (2026-10-12)
- **New logo**, the keep, in the title bar, window, Start menu, desktop shortcut and installer.
- The window fills the screen at any size. Clicking the Citekeep name returns to the Library.

## V30 (2026-10-11)
- **Settings** and **Help** tabs.
- Claim-check results are saved between sessions, with a Word report.

## V29 (2026-10-11)
- **Updates from inside Citekeep**: checks GitHub once a day and installs the new version itself. Never replaces a newer version with an older one.

## V28 (2026-10-11)
- Claim check judges support for a paraphrase or synthesis instead of looking for matching wording, so far fewer "partly supported" verdicts.

## V27 (2026-10-11)
- Updated Google Drive setup steps, including adding yourself as a test user.

## V26 (2026-10-11)
- **List a Drive folder**: save a .txt list of one Google Drive folder's files.
- The installer closes a running Citekeep before updating.

## V25 (2026-10-11)
- **Claim check**: for each cited sentence, the AI reads the cited PDF and says whether it supports the sentence, quoting the passage and page.

## V24 (2026-10-11)
- **First public release**: MIT License, third-party notices, README, published on GitHub.

## V23 (2026-10-11)
- **Add from PDF**, **rebuild a reference list** from what the text cites, **search inside your PDFs**, **duplicates**, and **tag folders** (Dissertation/Chapter 2).

## V22 (2026-10-11)
- **Transfer file** for moving to a new computer (library, settings, and optionally PDFs and keys); daily backups; sharing a library folder between computers.

## V21 (2026-10-10)
- **Free PDFs** through Unpaywall, **Search for PDF**, and a Downloads watch that files and links what you download.
- A first-run choice: use the library already on this computer, or start a new one.

## V20 (2026-10-10)
- **Installable Windows app** with a per-user installer: no administrator password needed.

## Earlier versions
- V19: literature matrix (Pratt's template) with AI drafting from your PDFs.
- V18: PDFs matched to references by the DOI and title inside them, so file names don't matter.
- V17: drag to reorder the reference list.
- V16: retraction alerts from Crossref, checking several chapters against one reference list, and hand-ordered reference lists.
- V1 to V15: the library, reading Word documents, checking typed APA 7 citations against the reference list, corrections and linked copies.
