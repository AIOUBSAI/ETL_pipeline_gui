# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Project Launcher**, an Electron desktop application inspired by Legseq. It provides a beautiful interface for managing and executing projects with features including:
- Multi-project management with live log streaming
- Admin/User authentication system
- 13 built-in themes with dynamic switching
- Python script execution with process management
- Settings persistence using Electron's userData

## Development Commands

```bash
# Start the application
npm start

# Development mode with console logging enabled
npm run dev

# Build/package the application
npm run package
```

## Architecture

### Electron Multi-Process Pattern

The app follows Electron's security-first architecture with three distinct layers:

1. **Main Process** (`src/main/`): Node.js backend handling OS operations, file system, and child processes
2. **Renderer Process** (`src/renderer/`): Browser-based UI layer with no direct Node.js access
3. **Preload Script** (`src/preload/index.js`): Security bridge using `contextBridge` to expose safe IPC APIs

### IPC Communication

All main-renderer communication happens through the preload-exposed `window.electronAPI`:

- **Renderer → Main**: Use `.invoke()` for async request-response patterns
- **Main → Renderer**: Use `.send()` for one-way event notifications

Key IPC channels are organized in `src/main/ipc/`:
- `projects.js`: Project scanning, Python script execution, process management
- `settings.js`: Settings persistence and retrieval
- `window.js`: Window control operations (minimize, maximize, close)

### State Management

Centralized reactive state in `src/renderer/core/state.js`:
- Uses pub/sub pattern with listener callbacks
- `setState()` merges updates and triggers listeners
- Key state includes: `projects`, `logs`, `currentView`, `isAdmin`

### Component System

UI components in `src/renderer/components/` are standalone modules:
- Each exports an `init()` function for initialization
- Components use DOM utilities from `src/renderer/utils/dom.js`
- Dialog system (`dialog.js`) provides modal overlay framework

### Application Entry Points

**Main Process**: `src/main/index.js`
```javascript
app.whenReady() → initialize()
  → loadSettings()
  → registerIPCHandlers()
  → createWindow()
```

**Renderer Process**: `src/renderer/index.js`
```javascript
DOMContentLoaded → init()
  → loadTheme()
  → initComponents()
  → initViews()
  → checkAdminSession()
  → loadSettings()
  → loadProjects()
```

## Key Technical Details

### Project Execution Flow

When executing a Python project:
1. User clicks "Run" in dashboard
2. Renderer invokes `run-python-script` with project path and arguments
3. Main process spawns Python child process via `child_process.spawn()`
4. Stdout/stderr streams are captured and sent back via `project-output` channel
5. Logs displayed in real-time in dashboard with filtering (info/success/error/all)
6. Process can be terminated via `stop-project` IPC call

### Settings Architecture

Settings stored in Electron's userData directory as `settings.json`:
- Managed by `src/main/utils/settings.js`
- Default settings include: `rootFolder`, `theme`, `pythonPath`, login credentials
- Changes persist across app restarts
- Access via `get-settings`, `update-setting`, `get-setting` IPC channels

### Theme System

13 pre-built themes in `src/renderer/styles/themes/`:
- CSS files define `data-theme` attribute styles
- Dynamic loading without restart via `src/renderer/core/theme.js`
- Theme selection dialog with search/filter in `src/renderer/dialogs/themes.js`
- Themes: Catppuccin variants (4), Dracula, GitHub, Gruvbox, Monokai, Nord, One Dark, Solarized, Tokyo Night

### Authentication System

Two-tier login in `src/renderer/dialogs/login.js`:
- **User mode**: Limited access (Dashboard only)
- **Admin mode**: Full access (Dashboard, Editor, Database, Reports)
- Credentials stored in settings (default: admin/admin, user/user)
- Session state tracked in global state (`isAdmin` flag)

## File Organization Conventions

- **Main process files**: Backend logic, no UI code
- **Renderer files**: UI code, no direct Node.js APIs (use IPC)
- **Preload script**: Only expose necessary APIs, maintain security
- **IPC handlers**: Group related channels in single files
- **Components**: Self-contained, reusable UI modules
- **Views**: Page-level components under `src/renderer/views/`

## Important Architectural Constraints

1. **Security**: Context isolation enabled, no `nodeIntegration` in renderer
2. **IPC Safety**: Never expose raw Node.js APIs to renderer—use specific, validated IPC channels
3. **Process Management**: Track child processes to avoid orphaned Python processes on app close
4. **State Updates**: Always use `setState()` to trigger reactive updates
5. **Theme Loading**: Load theme CSS before rendering to prevent flash of unstyled content

## Window Configuration

Custom frameless window with hidden title bar:
- Default size: 1400x900 (min: 1000x600)
- Custom title bar component handles window controls
- Background color: `#303446` (Catppuccin Frappé base)
- DevTools auto-open in development mode

## Adding New Features

### Adding a new IPC channel:
1. Define handler in `src/main/ipc/` (or create new file)
2. Register in `src/main/index.js` via `ipcMain.handle()` or `ipcMain.on()`
3. Expose in `src/preload/index.js` via `contextBridge.exposeInMainWorld()`
4. Call from renderer via `window.electronAPI.yourMethod()`

### Adding a new component:
1. Create file in `src/renderer/components/`
2. Export `init()` function
3. Call from `src/renderer/index.js` during initialization
4. Use `src/renderer/utils/dom.js` for DOM manipulation

### Adding a new view:
1. Create directory under `src/renderer/views/`
2. Export `init()` function
3. Register in view initialization section of `src/renderer/index.js`
4. Update sidebar navigation if needed
