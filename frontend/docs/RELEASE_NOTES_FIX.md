# Release Notes Rendering Fix

## Problem

The application had two versions of the release notes dialog with different issues:

### `release-notes_old.js` - Silent Failure
- **Issue**: Used CDN to load `marked` and `mermaid` libraries dynamically
- **Result**: Failed silently when offline, markdown file did not render
- **Cause**: No internet connection to fetch libraries from CDN

### `release-notes.js` - Splash Screen Freeze
- **Issue**: Used invalid ES module imports:
  ```javascript
  import { marked } from '../../node_modules/marked/lib/marked.esm.js';
  import mermaid from '../../node_modules/mermaid/dist/mermaid.esm.min.mjs';
  ```
- **Result**: Application froze at splash screen and wouldn't render
- **Cause**:
  - Relative paths like `../../node_modules/` don't work in Electron's renderer process
  - ES module import failures are synchronous and fatal
  - Blocked the entire initialization chain before the app could start

## Root Cause

The fundamental issue was attempting to import Node.js dependencies directly in the Electron renderer process, which has different module resolution rules than Node.js or standard browser environments.

## Solution

Implemented a **hybrid approach** following Electron's security-first architecture:

### 1. Main Process - Markdown Processing
**File**: `frontend/src/main/ipc/release-notes.js`

- Load `marked` library using Node.js `require()` (works in main process)
- Read markdown file from disk
- Convert markdown to HTML server-side
- Return processed HTML to renderer via IPC

```javascript
const { marked } = require('marked');

ipcMain.handle('read-release-notes', async () => {
  const markdown = fs.readFileSync(releaseNotesPath, 'utf-8');
  const html = marked.parse(markdown);
  return successResponse({ markdown, html });
});
```

### 2. Local Library Bundle - Mermaid
**File**: `frontend/src/renderer/lib/mermaid.min.js`

- Copied mermaid library from `node_modules/mermaid/dist/` to renderer-accessible location
- Load as a regular script tag from local filesystem (no CDN)
- Runs in browser DOM context where it can generate SVG diagrams

```bash
cp node_modules/mermaid/dist/mermaid.min.js src/renderer/lib/
```

### 3. Renderer Process - Display Only
**File**: `frontend/src/renderer/dialogs/release-notes.js`

- Receive pre-processed HTML from main process
- Load mermaid from local file: `./lib/mermaid.min.js`
- Render mermaid diagrams client-side (requires browser DOM)
- No ES module imports, no CDN calls

```javascript
// Load local mermaid
const script = document.createElement('script');
script.src = './lib/mermaid.min.js';
document.head.appendChild(script);

// Render diagrams after HTML is displayed
const { svg } = await mermaid.render(id, code);
```

## Benefits

✅ **Works 100% offline** - All libraries loaded from local files
✅ **No splash screen freeze** - No invalid imports blocking initialization
✅ **Proper separation of concerns**:
  - **marked** runs in main process (Node.js environment)
  - **mermaid** runs in renderer (browser DOM - required for SVG generation)
✅ **CSP compliant** - No external script sources
✅ **Secure** - Maintains Electron's context isolation
✅ **Scalable pattern** - Template for future library integrations

## Architecture Pattern for Future Libraries

### Node.js Libraries (YAML, CSV parsers, etc.)
Process in **main process** using `require()`:

```javascript
// Main process IPC handler
const yaml = require('js-yaml');
const data = yaml.load(fileContent);
return successResponse({ data });
```

### Browser Libraries (syntax highlighters, charting, etc.)
Bundle to **renderer** local folder:

```bash
cp node_modules/prismjs/prism.min.js src/renderer/lib/
```

Load via script tag:
```javascript
const script = document.createElement('script');
script.src = './lib/prism.min.js';
document.head.appendChild(script);
```

## Files Changed

- `frontend/src/main/ipc/release-notes.js` - Process markdown in main process
- `frontend/src/renderer/dialogs/release-notes.js` - Load local mermaid, render diagrams
- `frontend/src/renderer/lib/mermaid.min.js` - Local copy of mermaid (3.2MB)

## Testing

1. Start app: `npm start` or `npm run dev`
2. Open Release Notes dialog
3. Verify markdown renders correctly
4. Check that mermaid diagrams display as visual SVG (not code blocks)
5. Confirm no console errors in DevTools (F12)

## Known Limitations

- Mermaid diagrams require the renderer's browser DOM to generate SVG
- Cannot process mermaid in main process (Node.js has no DOM)
- Mermaid library adds 3.2MB to application bundle size
