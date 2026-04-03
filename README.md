# Apryse DOCX Editor

A browser-based DOCX editor built with [Apryse WebViewer](https://apryse.com) and React + Vite.

## Features

- Open any `.docx` file from disk
- Full rich-text editing via Apryse's Office Editor (bold, italic, headings, lists, tables, …)
- Save / download the edited file as a `.docx`
- Create new blank documents

## Setup

### 1. Get a free trial key

Sign up at <https://dev.apryse.com> and copy your license key.

### 2. Paste the key

Open `src/components/WebViewerEditor.jsx` and replace the placeholder:

```js
const APRYSE_LICENSE_KEY = 'YOUR_APRYSE_LICENSE_KEY_HERE'
```

### 3. Install dependencies & copy WebViewer assets

```bash
npm install
node scripts/copy-webviewer.js
```

> The second command copies ~50 MB of WebViewer static files from
> `node_modules/@pdftron/webviewer/public` → `public/webviewer/lib`.
> It only needs to run once (or after upgrading the package).

### 4. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>.

## Project structure

```
src/
  App.jsx                   – root layout, file-open / save logic
  components/
    Toolbar.jsx             – New / Open / Save buttons
    WebViewerEditor.jsx     – Apryse WebViewer wrapper
public/
  webviewer/lib/            – (generated) Apryse static assets
scripts/
  copy-webviewer.js         – one-time asset copy helper
```

## How it works

| Step | Code |
|------|------|
| Init viewer | `WebViewer({ enableOfficeEditing: true }, domRef)` |
| Load file   | `instance.UI.loadDocument(objectUrl, { extension: 'docx' })` |
| Save file   | `doc.getFileData({ downloadType: 'office' })` → Blob → `<a>` download |

## Notes

- `enableOfficeEditing: true` activates Apryse's native DOCX editor mode.
- The `path` option must point to the copied `public/webviewer/lib` folder.
- WebViewer runs entirely in-browser — no server-side processing needed.
