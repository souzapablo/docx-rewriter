# Apryse DOCX Editor

A browser-based DOCX editor with AI rewriting, built with [Apryse WebViewer](https://apryse.com), React, and Vite.

## Features

- Open any `.docx` file from disk
- Full rich-text editing via Apryse's Office Editor (bold, italic, headings, lists, tables, …)
- AI-powered rewriting — select text, describe the change, Claude rewrites it in-place while preserving all formatting
- Save / download the edited file as a `.docx`

## Setup

### 1. Copy the env file and fill in your keys

```bash
cp .env.example .env
```

| Variable | Where to get it |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `VITE_APRYSE_LICENSE_KEY` | [dev.apryse.com](https://dev.apryse.com) |

### 2. Install and run

```bash
npm install
npm run dev
```

`npm run dev` automatically copies the WebViewer static assets from
`node_modules/@pdftron/webviewer/public` → `public/lib/webviewer/` before
starting the dev server.

Open <http://localhost:5173>.

## Project structure

```
src/
  App.jsx                      – root layout, file-open / save / AI rewrite logic
  components/
    Toolbar.jsx                – New / Open / Save / AI rewrite buttons
    WebViewerEditor.jsx        – Apryse WebViewer wrapper
  utils/
    aiRewrite.js               – calls Claude API with the selected text and prompt
    docxRewriter.js            – reads and writes .docx XML (extract paragraphs / rebuild file)
public/
  lib/webviewer/               – (generated) Apryse static assets, not committed to git
scripts/
  copy-webviewer-files.cjs     – copies WebViewer assets from node_modules (run automatically)
```

## How it works

### Viewing and editing
| Step | Code |
|---|---|
| Init viewer | `WebViewer({ enableOfficeEditing: true }, domRef)` |
| Load file | `instance.UI.loadDocument(objectUrl, { extension: 'docx' })` |
| Save file | `doc.getFileData({ downloadType: 'office' })` → Blob → `<a>` download |

### AI rewriting
1. `docxRewriter.js` unzips the `.docx`, parses `word/document.xml`, and extracts all paragraphs with their position indexes and formatting metadata.
2. The selected paragraphs and a user prompt are sent to Claude via `aiRewrite.js`.
3. Claude returns rewritten text mapped back to paragraph indexes.
4. `docxRewriter.js` patches the XML — keeping the original run formatting, replacing only the text — and repackages the file as a new `.docx`.

## Notes

- WebViewer runs entirely in-browser — no server-side processing needed.
- The Apryse WebViewer assets are large (~50 MB) and excluded from git via `.gitignore`. They are regenerated automatically on `npm run dev` or `npm run build`.
- `docxRewriter.js` is a custom XML-level editor rather than a library like docxtemplater, because the AI edits arbitrary documents with no pre-authored templates.
