# ETL Pipeline GUI - Frontend Extension Plan

## Overview

Transform the existing Electron frontend from a simple project launcher into a comprehensive **ETL Pipeline Management GUI**. The backend Python ETL framework remains **unchanged** - all new functionality will be visual interfaces for creating, managing, and monitoring pipelines.

## Table of Contents

- [Architecture Summary](#architecture-summary)
- [Implementation Phases](#implementation-phases)
- [File Structure](#file-structure)
- [Technical Dependencies](#technical-dependencies)
- [Implementation Priorities](#implementation-priorities)
- [Success Criteria](#success-criteria)
- [Timeline & Resources](#timeline--resources)

---

## Architecture Summary

### Current State

- **Dashboard View**: Simple project execution with log streaming
- **Editor/Database/Reports Views**: Placeholder pages (admin-protected)
- **Backend Integration**: Basic Python process execution via IPC

### Target State

Add 4 major new view sections to manage the ETL pipeline lifecycle:

1. **Pipeline Builder** - Visual YAML pipeline configuration
2. **SQL/Python Editor** - Code editors for transformations
3. **Database Explorer** - DuckDB/SQLite browser and query tool
4. **Reports Viewer** - HTML report display and pipeline monitoring

### Design Principles

✅ **Zero Backend Changes** - Use existing CLI interface (`--json`, `--validate`, `--dry-run`)
✅ **File-Based Operations** - Read/write YAML configs and transform files
✅ **IPC Communication** - All main-renderer communication through secure channels
✅ **Admin-Protected** - Pipeline editing requires admin authentication
✅ **Theme Consistency** - All new views respect the 13 built-in themes

---

## Implementation Phases

### Phase 1: Core Infrastructure (Foundation)

**Goal**: Establish the communication layer between frontend and backend

#### 1.1 Backend IPC Extensions

**New File**: [`frontend/src/main/ipc/pipeline.js`](frontend/src/main/ipc/pipeline.js)

**Purpose**: Bridge between Electron and Python ETL backend

**IPC Channels**:

```javascript
// Pipeline Management
'pipeline:list'           → List all pipeline.yaml files in configured directory
'pipeline:read'           → Read pipeline YAML content
'pipeline:write'          → Save pipeline YAML (with backup)
'pipeline:validate'       → Run `python -m pipeline.cli --validate`
'pipeline:execute'        → Run pipeline with options (--json output for streaming)
'pipeline:stop'           → Terminate running pipeline process

// Database Operations
'pipeline:get-schema'     → Get DuckDB/SQLite schema info (SHOW TABLES, DESCRIBE)
'pipeline:query'          → Execute SQL query on database (read-only by default)
'pipeline:export-table'   → Export table to CSV/JSON

// Reports
'pipeline:list-reports'   → List generated HTML reports from reports/
'pipeline:read-report'    → Read report HTML content

// File Operations (Transforms)
'file:read'               → Read transform files (SQL/Python)
'file:write'              → Write transform files
'file:list'               → List files in transforms directory
'file:delete'             → Delete file (with confirmation)
```

**Implementation Notes**:

- Use `child_process.spawn()` for pipeline execution (similar to existing `projects.js`)
- Stream JSON output using `--json` flag for real-time progress updates
- Track process IDs in a Map to allow cancellation
- Handle file system operations with proper error handling and validation
- Create automatic backups before writing pipeline.yaml

**Example Implementation**:

```javascript
// frontend/src/main/ipc/pipeline.js
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const runningProcesses = new Map();

ipcMain.handle('pipeline:execute', async (event, pipelinePath, options = {}) => {
  const args = [
    '-m', 'pipeline.cli',
    '--pipeline', pipelinePath,
    '--json'  // JSON output for streaming
  ];

  if (options.validate) args.push('--validate');
  if (options.dryRun) args.push('--dry-run');

  const pythonProcess = spawn('python', args, {
    cwd: path.dirname(pipelinePath)
  });

  const processId = Date.now().toString();
  runningProcesses.set(processId, pythonProcess);

  pythonProcess.stdout.on('data', (data) => {
    // Parse JSON-Lines output and stream to renderer
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => {
      try {
        const jsonLog = JSON.parse(line);
        event.sender.send('pipeline:output', { processId, log: jsonLog });
      } catch (e) {
        // Fallback for non-JSON output
        event.sender.send('pipeline:output', { processId, log: { message: line } });
      }
    });
  });

  return { processId, success: true };
});
```

#### 1.2 State Management Extensions

**File**: [`frontend/src/renderer/core/state.js`](frontend/src/renderer/core/state.js)

**New State Properties**:

```javascript
export const state = {
  // ... existing state preserved (currentView, projects, logs, etc.)

  // Pipeline State
  pipelines: [],                    // List of available pipeline.yaml files
  currentPipeline: null,            // Currently loaded pipeline config object
  pipelineValidation: null,         // Validation results { errors: [], warnings: [] }
  pipelineExecutionStatus: null,    // { status: 'running' | 'success' | 'error', progress: 0.6 }

  // Editor State
  transformFiles: [],               // List of SQL/Python transform files
  currentFile: null,                // Currently edited file { path, content, language, dirty }
  unsavedChanges: false,

  // Database State
  databases: [],                    // Available databases [{ name, path, type: 'duckdb' }]
  currentDatabase: null,            // Selected database
  schemas: [],                      // Schemas in current database
  tables: [],                       // Tables in current schema
  queryResults: null,               // Last query results { columns, rows, duration }

  // Reports State
  reports: [],                      // Available HTML reports [{ name, path, date }]
  currentReport: null               // Currently viewed report { name, path, content }
};
```

#### 1.3 Preload API Extensions

**File**: [`frontend/src/preload/index.js`](frontend/src/preload/index.js)

**Expose New IPC Channels**:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing APIs preserved ...

  // Pipeline APIs
  pipeline: {
    list: () => ipcRenderer.invoke('pipeline:list'),
    read: (path) => ipcRenderer.invoke('pipeline:read', path),
    write: (path, content) => ipcRenderer.invoke('pipeline:write', path, content),
    validate: (path) => ipcRenderer.invoke('pipeline:validate', path),
    execute: (path, options) => ipcRenderer.invoke('pipeline:execute', path, options),
    stop: (processId) => ipcRenderer.invoke('pipeline:stop', processId),

    getSchema: (dbPath) => ipcRenderer.invoke('pipeline:get-schema', dbPath),
    query: (dbPath, sql) => ipcRenderer.invoke('pipeline:query', dbPath, sql),
    exportTable: (dbPath, table, format) => ipcRenderer.invoke('pipeline:export-table', dbPath, table, format),

    listReports: () => ipcRenderer.invoke('pipeline:list-reports'),
    readReport: (path) => ipcRenderer.invoke('pipeline:read-report', path),

    // Event listeners for streaming output
    onPipelineOutput: (callback) => ipcRenderer.on('pipeline:output', (event, data) => callback(data)),
    removePipelineOutput: (callback) => ipcRenderer.removeListener('pipeline:output', callback)
  },

  // File APIs
  file: {
    read: (path) => ipcRenderer.invoke('file:read', path),
    write: (path, content) => ipcRenderer.invoke('file:write', path, content),
    list: (directory) => ipcRenderer.invoke('file:list', directory),
    delete: (path) => ipcRenderer.invoke('file:delete', path)
  }
});
```

---

### Phase 2: Pipeline Builder View

**Goal**: Create a visual interface for building and editing pipeline YAML configurations

#### 2.1 Pipeline List & Management

**New File**: [`frontend/src/renderer/views/pipeline/index.js`](frontend/src/renderer/views/pipeline/index.js)

**Features**:

- Display all pipeline.yaml files from configured directory
- Create new pipeline from templates
- Duplicate existing pipeline
- Delete pipeline (with confirmation dialog)
- Quick actions: Validate, Dry Run, Execute
- Search/filter pipelines by name

**UI Mock**:

```
┌──────────────────────────────────────────────────────────┐
│ Pipeline Builder                            [+ New] [⟳]  │
├──────────────────────────────────────────────────────────┤
│ [🔍 Search pipelines...]                                  │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐   │
│ │ ✓ reference.yaml                  [Edit] [⚙] [▶]  │   │
│ │   Complete Reference Pipeline                       │   │
│ │   4 stages • 15 jobs • Last run: 2 hours ago       │   │
│ ├────────────────────────────────────────────────────┤   │
│ │ ⚠ customers.yaml                  [Edit] [⚙] [▶]  │   │
│ │   Customer ETL Pipeline                            │   │
│ │   3 stages • 8 jobs • Validation errors: 2         │   │
│ ├────────────────────────────────────────────────────┤   │
│ │ ✓ products.yaml                   [Edit] [⚙] [▶]  │   │
│ │   Product Data Pipeline                            │   │
│ │   4 stages • 12 jobs • Last run: 1 day ago         │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Component Structure**:

```javascript
// frontend/src/renderer/views/pipeline/index.js
export function initializePipelineView() {
  loadPipelineList();
  setupPipelineActions();
}

async function loadPipelineList() {
  const pipelines = await window.electronAPI.pipeline.list();
  renderPipelineCards(pipelines);
}

function setupPipelineActions() {
  // New pipeline button
  document.getElementById('new-pipeline-btn').addEventListener('click', createNewPipeline);

  // Pipeline card actions (edit, validate, run)
  document.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'edit') {
      openPipelineEditor(e.target.dataset.pipelinePath);
    } else if (e.target.dataset.action === 'validate') {
      validatePipeline(e.target.dataset.pipelinePath);
    } // ... etc
  });
}
```

#### 2.2 Visual Pipeline Editor

**New File**: [`frontend/src/renderer/views/pipeline/editor.js`](frontend/src/renderer/views/pipeline/editor.js)

**Approach**: Form-based YAML editor (NOT drag-and-drop for Phase 1)

**Editor Sections**:

1. **Pipeline Metadata**
   - Name (text input)
   - Version (text input)
   - Description (textarea)

2. **Variables**
   - Key-value pair editor (add/remove/edit)
   - Variable substitution preview

3. **Database Configuration**
   - Type selection: DuckDB / SQLite
   - Path input (with file picker)
   - Schemas list (add/remove)
   - Reset on start (checkbox)
   - Advanced config (threads, memory_limit)

4. **Stages Configuration**
   - Ordered list of stages
   - Default: extract, stage, transform, export
   - Add/remove/reorder capabilities

5. **Jobs Configuration** (Most Complex)
   - List view of all jobs grouped by stage
   - Add/Edit/Delete/Duplicate/Reorder jobs
   - Dependency graph visualization
   - Validation status indicator per job

**UI Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│ [< Back to List]  reference.yaml    [Validate] [✓ Save]    │
├──────────────┬──────────────────────────────────────────────┤
│ Sections     │ Pipeline Configuration                        │
│              │                                               │
│ • Metadata   │ Name: [Complete Reference Pipeline........]  │
│ • Variables  │ Version: [1.0]                               │
│ • Database   │ Description:                                 │
│ • Stages     │ [Comprehensive reference demonstrating ALL]  │
│ ► Jobs (15)  │ [possible configuration options............] │
│   extract(3) │                                              │
│   stage(1)   │ ──────────────────────────────────────────── │
│   transform(9)│ ┌──────────────────────────────────────┐   │
│   export(2)  │ │ extract_csv                  [Edit]  │   │
│              │ │ Stage: extract                       │   │
│ [+ Add Job]  │ │ Runner: csv_reader                   │   │
│              │ │ Depends: []                          │   │
│              │ │ Input: data/*.csv                    │   │
│              │ │ Output: raw_csv_data                 │   │
│              │ │ Status: ✓ Valid                      │   │
│              │ │                                      │   │
│              │ │ [Duplicate] [Delete] [Move Up/Down]  │   │
│              │ └──────────────────────────────────────┘   │
│              │                                              │
│              │ ┌──────────────────────────────────────┐   │
│              │ │ stage_all                    [Edit]  │   │
│              │ │ Stage: stage                         │   │
│              │ │ ...                                  │   │
└──────────────┴──────────────────────────────────────────────┘
```

**Implementation Strategy**:

```javascript
// frontend/src/renderer/views/pipeline/editor.js
export class PipelineEditor {
  constructor(pipelinePath) {
    this.pipelinePath = pipelinePath;
    this.config = null;
    this.dirty = false;
  }

  async load() {
    const content = await window.electronAPI.pipeline.read(this.pipelinePath);
    this.config = jsyaml.load(content);
    this.render();
  }

  async save() {
    const yamlContent = jsyaml.dump(this.config);
    await window.electronAPI.pipeline.write(this.pipelinePath, yamlContent);
    this.dirty = false;
  }

  render() {
    this.renderMetadata();
    this.renderVariables();
    this.renderDatabase();
    this.renderJobs();
  }

  // ... section-specific render methods
}
```

#### 2.3 Job Configuration Forms

**New File**: [`frontend/src/renderer/views/pipeline/job-editor.js`](frontend/src/renderer/views/pipeline/job-editor.js)

**Challenge**: Each runner type has different input/output requirements

**Solution**: Runner-specific form templates

**New File**: [`frontend/src/renderer/views/pipeline/runner-configs.js`](frontend/src/renderer/views/pipeline/runner-configs.js)

```javascript
// Define configuration schema for each runner type
export const RUNNER_CONFIGS = {
  csv_reader: {
    type: 'reader',
    input: {
      path: { type: 'string', required: true, description: 'Directory path' },
      files: { type: 'string', required: true, description: 'File pattern (*.csv)' },
      delimiter: { type: 'string', default: ',', description: 'CSV delimiter' },
      has_header: { type: 'boolean', default: true, description: 'First row is header' },
      skip_rows: { type: 'number', default: 0, description: 'Rows to skip at start' },
      encoding: { type: 'string', default: 'utf-8', description: 'File encoding' }
    },
    output: {
      table: { type: 'string', required: true, description: 'Output table name' }
    },
    processors: true
  },

  excel_reader: {
    type: 'reader',
    input: {
      path: { type: 'string', required: true, description: 'Directory path' },
      files: { type: 'string', required: true, description: 'File pattern (*.xlsx)' },
      sheets: { type: 'array', description: 'Sheet names (all if empty)' },
      skip_rows: { type: 'number', default: 0 },
      header_row: { type: 'number', default: 0 }
    },
    output: {
      table: { type: 'string', required: true }
    },
    processors: true
  },

  duckdb_stager: {
    type: 'stager',
    schema: { type: 'string', required: true, description: 'Target schema', location: 'root' },
    input: {
      tables: { type: 'array', required: true, description: 'List of tables to stage' }
    },
    output: null,  // No output section for stagers
    processors: false
  },

  sql_transform: {
    type: 'transformer',
    input: {
      sql: { type: 'text', description: 'Inline SQL (or use sql_file)' },
      sql_file: { type: 'file', description: 'Path to .sql file' }
    },
    output: null,  // SQL creates tables directly
    processors: false
  },

  python_transform: {
    type: 'transformer',
    options: {
      input_tables: {
        type: 'array',
        required: true,
        itemSchema: {
          schema: { type: 'string', required: true },
          table: { type: 'string', required: true },
          alias: { type: 'string', required: true, description: 'Function parameter name' }
        }
      },
      python_file: { type: 'file', required: true, description: 'Path to .py file' },
      python_code: { type: 'text', description: 'Inline Python code (alternative)' },
      output: {
        type: 'array',
        required: true,
        itemSchema: {
          table: { type: 'string', required: true },
          schema: { type: 'string', required: true },
          source_df: { type: 'string', required: true, description: 'Return dict key' },
          mode: { type: 'select', options: ['replace', 'append'], default: 'replace' }
        }
      }
    },
    processors: true
  }

  // ... add more runner types (xml_reader, json_reader, csv_writer, etc.)
};
```

**Job Editor Dialog**:

```
┌───────────────────────────────────────────────────────┐
│ Edit Job: extract_csv                     [✓ Save]    │
├───────────────────────────────────────────────────────┤
│                                                       │
│ Job Name *     [extract_csv_____________________]    │
│                                                       │
│ Stage *        [extract ▼]                           │
│                                                       │
│ Runner *       [csv_reader ▼]                        │
│                                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                       │
│ Dependencies                                          │
│ Select jobs that must complete before this job:      │
│ [+ Add Dependency]                                    │
│                                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                       │
│ Input Configuration                                   │
│                                                       │
│ Path *         [{DATA_DIR}______________________]    │
│                                                       │
│ Files *        [*.csv___________________________]    │
│                                                       │
│ Delimiter      [,]                                   │
│                                                       │
│ Has Header     [✓] First row contains headers       │
│                                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                       │
│ Processors                                            │
│ [+ Add Processor]                                     │
│                                                       │
│ • normalize_headers                    [Configure]   │
│ • drop_empty_rows                      [Remove]      │
│                                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                       │
│ Output Configuration                                  │
│                                                       │
│ Table Name *   [raw_csv_data____________________]    │
│                                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                       │
│               [Cancel]              [Save Job]        │
└───────────────────────────────────────────────────────┘
```

**Dynamic Form Generation**:

```javascript
// frontend/src/renderer/views/pipeline/job-editor.js
export class JobEditor {
  constructor(job, allJobs) {
    this.job = job || this.createEmptyJob();
    this.allJobs = allJobs;
    this.runnerConfig = null;
  }

  onRunnerChange(runnerType) {
    this.runnerConfig = RUNNER_CONFIGS[runnerType];
    this.renderInputForm();
    this.renderOutputForm();
    this.renderProcessorsSection();
  }

  renderInputForm() {
    const container = document.getElementById('job-input-container');
    container.innerHTML = '';

    if (!this.runnerConfig?.input) return;

    for (const [key, config] of Object.entries(this.runnerConfig.input)) {
      const field = this.createFormField(key, config, this.job.input?.[key]);
      container.appendChild(field);
    }
  }

  createFormField(name, config, value) {
    const field = document.createElement('div');
    field.className = 'form-field';

    const label = document.createElement('label');
    label.textContent = config.description || name;
    if (config.required) label.textContent += ' *';

    let input;
    switch (config.type) {
      case 'string':
        input = document.createElement('input');
        input.type = 'text';
        input.value = value || config.default || '';
        break;
      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        input.value = value || config.default || 0;
        break;
      case 'boolean':
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = value !== undefined ? value : config.default;
        break;
      case 'text':
        input = document.createElement('textarea');
        input.value = value || '';
        break;
      case 'array':
        // Special handling for array types
        input = this.createArrayEditor(config, value);
        break;
      // ... handle other types
    }

    field.appendChild(label);
    field.appendChild(input);
    return field;
  }

  // ... more methods
}
```

---

### Phase 3: Editor View (SQL/Python Transforms)

**Goal**: Provide a code editor for writing and managing transformation scripts

#### 3.1 Transform File Manager

**File**: Replace [`frontend/src/renderer/views/editor/index.js`](frontend/src/renderer/views/editor/index.js)

**Features**:

- File tree showing `schema/transforms/sql/` and `schema/transforms/python/`
- Create new transform file (with templates)
- Open/Edit/Save/Delete files
- Syntax highlighting (Monaco Editor)
- Run validation:
  - Python: syntax check + import check
  - SQL: basic syntax check
- File search/filter
- Recent files list

**UI Layout**:

```
┌────────────┬────────────────────────────────────────────────┐
│ Transforms │ transforms/python/enrich.py         [✓ Save]  │
│            ├────────────────────────────────────────────────┤
│ [+ New ▼]  │ import polars as pl                            │
│            │ from typing import Dict                        │
│ 📁 sql/    │                                                │
│  • clean.sql def transform(customers_df: pl.DataFrame):     │
│  • agg.sql │     """                                        │
│  • join.sql│     Transform customers data.                  │
│            │                                                │
│ 📁 python/ │     Args:                                      │
│  ► enrich.py customers_df: Input DataFrame                 │
│  • custom.py                                               │
│  • utils.py│     Returns:                                   │
│            │         Dict mapping output names to DFs       │
│ [Validate] │     """                                        │
│ [Run]      │     result = customers_df.with_columns([       │
│            │         pl.col("revenue").cast(pl.Float64)     │
│            │     ])                                         │
│            │                                                │
│            │     return {"result_df": result}               │
└────────────┴────────────────────────────────────────────────┘
```

**Component Structure**:

```javascript
// frontend/src/renderer/views/editor/index.js
import { MonacoWrapper } from './monaco-wrapper.js';
import { TRANSFORM_TEMPLATES } from './templates.js';

export function initializeEditorView() {
  loadFileTree();
  initializeMonaco();
  setupEditorActions();
}

let monacoWrapper = null;

async function initializeMonaco() {
  monacoWrapper = new MonacoWrapper('editor-container');
  await monacoWrapper.init();
}

async function loadFileTree() {
  const sqlFiles = await window.electronAPI.file.list('schema/transforms/sql');
  const pythonFiles = await window.electronAPI.file.list('schema/transforms/python');

  renderFileTree({ sql: sqlFiles, python: pythonFiles });
}

async function openFile(path) {
  const content = await window.electronAPI.file.read(path);
  const language = path.endsWith('.py') ? 'python' : 'sql';

  monacoWrapper.setContent(content, language);
  monacoWrapper.setPath(path);

  setState('currentFile', { path, content, language, dirty: false });
}

async function saveFile() {
  const file = getState('currentFile');
  const content = monacoWrapper.getContent();

  await window.electronAPI.file.write(file.path, content);
  setState('unsavedChanges', false);

  showToast('File saved successfully', 'success');
}
```

#### 3.2 Monaco Editor Integration

**Library**: **Monaco Editor** (same as VS Code)

**Installation**:

```bash
npm install monaco-editor
npm install monaco-editor-webpack-plugin --save-dev  # For Webpack
```

**New File**: [`frontend/src/renderer/views/editor/monaco-wrapper.js`](frontend/src/renderer/views/editor/monaco-wrapper.js)

**Purpose**: Wrapper class to manage Monaco instances

```javascript
// frontend/src/renderer/views/editor/monaco-wrapper.js
import * as monaco from 'monaco-editor';

export class MonacoWrapper {
  constructor(containerId) {
    this.containerId = containerId;
    this.editor = null;
    this.currentPath = null;
  }

  async init() {
    const container = document.getElementById(this.containerId);

    this.editor = monaco.editor.create(container, {
      value: '',
      language: 'python',
      theme: this.getTheme(),
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      wordWrap: 'on'
    });

    // Listen for content changes
    this.editor.onDidChangeModelContent(() => {
      setState('unsavedChanges', true);
    });

    // Listen for theme changes
    subscribe('settings', (settings) => {
      this.updateTheme(settings.theme);
    });
  }

  getTheme() {
    const appTheme = getState('settings').theme;
    // Map app themes to Monaco themes
    return appTheme.includes('light') ? 'vs' : 'vs-dark';
  }

  updateTheme(appTheme) {
    const monacoTheme = appTheme.includes('light') ? 'vs' : 'vs-dark';
    monaco.editor.setTheme(monacoTheme);
  }

  setContent(content, language) {
    const model = monaco.editor.createModel(content, language);
    this.editor.setModel(model);
  }

  getContent() {
    return this.editor.getValue();
  }

  setPath(path) {
    this.currentPath = path;
  }

  dispose() {
    if (this.editor) {
      this.editor.dispose();
    }
  }
}
```

**Configuration in HTML** (if using CDN instead of bundling):

```html
<!-- frontend/src/renderer/index.html -->
<script>
  // Monaco Editor requires AMD loader
  window.require = { paths: { 'vs': 'node_modules/monaco-editor/min/vs' } };
</script>
<script src="node_modules/monaco-editor/min/vs/loader.js"></script>
```

#### 3.3 Transform Templates

**New File**: [`frontend/src/renderer/views/editor/templates.js`](frontend/src/renderer/views/editor/templates.js)

**Purpose**: Pre-built templates for common transformations

```javascript
export const TRANSFORM_TEMPLATES = {
  python: {
    basic: {
      name: 'Basic Transformation',
      description: 'Single input → single output',
      content: `import polars as pl
from typing import Dict

def transform(input_df: pl.DataFrame) -> Dict[str, pl.DataFrame]:
    """
    Basic transformation template.

    Args:
        input_df: Input DataFrame from DuckDB

    Returns:
        Dictionary mapping output names to DataFrames
    """
    # Your transformation logic here
    result = input_df.with_columns([
        # Add your column transformations
        pl.col("column_name").cast(pl.Float64).alias("new_column")
    ])

    return {"result_df": result}
`
    },

    multi_input: {
      name: 'Multi-Input Transformation',
      description: 'Multiple inputs → single output',
      content: `import polars as pl
from typing import Dict

def transform(
    customers_df: pl.DataFrame,
    orders_df: pl.DataFrame
) -> Dict[str, pl.DataFrame]:
    """
    Join multiple DataFrames.

    Args:
        customers_df: Customers data
        orders_df: Orders data

    Returns:
        Dictionary with joined result
    """
    # Join DataFrames
    result = customers_df.join(
        orders_df,
        on="customer_id",
        how="left"
    )

    return {"result_df": result}
`
    },

    window_functions: {
      name: 'Window Functions',
      description: 'Cumulative sum, row numbers, etc.',
      content: `import polars as pl
from typing import Dict

def transform(input_df: pl.DataFrame) -> Dict[str, pl.DataFrame]:
    """
    Window function example.
    IMPORTANT: Sort before using over() for ordered operations.
    """
    # Sort first (required for ordered window functions)
    result = input_df.sort("category", "date").with_columns([
        # Cumulative sum within category
        pl.col("amount").cum_sum().over("category").alias("cumulative_amount"),

        # Row number within category
        pl.col("date").cum_count().over("category").alias("row_num")
    ])

    return {"result_df": result}
`
    }
  },

  sql: {
    select_filter: {
      name: 'SELECT with Filtering',
      description: 'Basic SELECT statement',
      content: `-- Basic SELECT with filtering
CREATE OR REPLACE TABLE analytics.filtered_data AS
SELECT
    customer_id,
    customer_name,
    CAST(amount AS DOUBLE) as amount,
    order_date
FROM staging.raw_data
WHERE
    order_date >= '2024-01-01'
    AND amount > 0
ORDER BY order_date DESC;
`
    },

    aggregation: {
      name: 'Aggregation with GROUP BY',
      description: 'Summarize data',
      content: `-- Aggregation example
CREATE OR REPLACE TABLE analytics.summary AS
SELECT
    category,
    COUNT(*) as total_records,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    MIN(order_date) as first_order,
    MAX(order_date) as last_order
FROM staging.orders
GROUP BY category
HAVING SUM(amount) > 1000
ORDER BY total_amount DESC;
`
    },

    yaml_sql: {
      name: 'YAML SQL Template',
      description: 'Documented SQL transformation',
      content: `metadata:
  name: "Customer Transformations"
  version: "1.0"
  description: "Clean and enrich customer data"

transformations:
  - name: "clean_customers"
    description: "Remove invalid records and standardize fields"
    schema: "staging"
    tables_created: ["customers"]
    depends_on: ["input.raw_customers"]
    sql: |
      CREATE OR REPLACE TABLE staging.customers AS
      SELECT
        customer_id,
        TRIM(UPPER(customer_name)) as customer_name,
        LOWER(email) as email,
        phone,
        created_at
      FROM input.raw_customers
      WHERE customer_id IS NOT NULL
        AND email IS NOT NULL;
`
    }
  }
};
```

**Template Selector UI**:

```javascript
// frontend/src/renderer/views/editor/index.js
function showNewFileDialog() {
  const dialog = `
    <div class="dialog" id="new-file-dialog">
      <div class="dialog-content">
        <h2>New Transform File</h2>

        <label>File Type</label>
        <select id="file-type-select">
          <option value="python">Python (.py)</option>
          <option value="sql">SQL (.sql)</option>
        </select>

        <label>Template</label>
        <select id="template-select">
          <!-- Populated dynamically based on file type -->
        </select>

        <label>File Name</label>
        <input type="text" id="file-name-input" placeholder="my_transform" />

        <div class="dialog-actions">
          <button class="btn-secondary" data-action="cancel">Cancel</button>
          <button class="btn-primary" data-action="create">Create</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', dialog);
  initializeDialogs();
}
```

---

### Phase 4: Database View

**Goal**: Browse database schemas and execute SQL queries

#### 4.1 Database Explorer

**File**: Replace [`frontend/src/renderer/views/database/index.js`](frontend/src/renderer/views/database/index.js)

**Features**:

- Connect to pipeline database (path from pipeline config)
- Schema tree view:
  - Databases → Schemas → Tables → Columns
- Table preview (first 100 rows, paginated)
- Table statistics (row count, size, column types)
- Export table to CSV/JSON
- Refresh schema
- Multi-database support (if multiple DBs in pipeline)

**UI Layout**:

```
┌──────────────┬──────────────────────────────────────────────┐
│ Database     │ warehouse.duckdb              [Refresh] [⚙]  │
│              ├──────────────────────────────────────────────┤
│ [Connect]    │ Table: landing.raw_csv_data                  │
│              │ 5 columns • 118 rows • 12.3 KB               │
│ 📊 landing   │                                              │
│  ▼ Tables    │ [🔍] [Export ▼]                              │
│   ► raw_csv  │ ┌─────┬──────────┬─────────┬───────────┐    │
│   ► raw_xml  │ │ id  │ name     │ amount  │ date      │    │
│   ► raw_json │ ├─────┼──────────┼─────────┼───────────┤    │
│              │ │ 1   │ Alice    │ 100.50  │ 2024-01-15│    │
│ 📊 staging   │ │ 2   │ Bob      │ 250.00  │ 2024-01-16│    │
│  ▼ Tables    │ │ 3   │ Charlie  │ 175.25  │ 2024-01-17│    │
│   ► customers│ └─────┴──────────┴─────────┴───────────┘    │
│   ► products │                                              │
│              │ Page 1 of 2        [< Previous] [Next >]     │
│ 📊 analytics │                                              │
│  ▼ Tables    │ ──────────────────────────────────────────── │
│   ► enriched │ Columns:                                     │
│              │ • id (INTEGER, NOT NULL)                     │
│              │ • name (VARCHAR)                             │
│              │ • amount (DOUBLE)                            │
│              │ • date (DATE)                                │
└──────────────┴──────────────────────────────────────────────┘
```

**Component Structure**:

```javascript
// frontend/src/renderer/views/database/index.js
export function initializeDatabaseView() {
  loadDatabaseList();
  setupDatabaseActions();
}

async function loadDatabaseList() {
  // Get databases from pipeline configuration
  const pipelines = await window.electronAPI.pipeline.list();
  const databases = [];

  for (const pipeline of pipelines) {
    const config = await window.electronAPI.pipeline.read(pipeline.path);
    if (config.databases) {
      Object.entries(config.databases).forEach(([name, db]) => {
        databases.push({ name, ...db, pipeline: pipeline.name });
      });
    }
  }

  setState('databases', databases);
  renderDatabaseSelector(databases);
}

async function connectToDatabase(dbPath) {
  const schema = await window.electronAPI.pipeline.getSchema(dbPath);
  setState('currentDatabase', { path: dbPath, schema });
  renderSchemaTree(schema);
}

async function loadTable(tableName) {
  const db = getState('currentDatabase');
  const result = await window.electronAPI.pipeline.query(
    db.path,
    `SELECT * FROM ${tableName} LIMIT 100`
  );

  renderTablePreview(result);
}
```

**New File**: [`frontend/src/renderer/views/database/schema-tree.js`](frontend/src/renderer/views/database/schema-tree.js)

```javascript
// Render hierarchical schema tree
export function renderSchemaTree(schema) {
  const container = document.getElementById('schema-tree');
  container.innerHTML = '';

  schema.schemas.forEach(schemaName => {
    const schemaNode = createSchemaNode(schemaName, schema.tables[schemaName]);
    container.appendChild(schemaNode);
  });
}

function createSchemaNode(schemaName, tables) {
  const node = document.createElement('div');
  node.className = 'schema-node';

  node.innerHTML = `
    <div class="schema-header" data-schema="${schemaName}">
      <span class="icon" data-icon="Database" data-icon-size="16"></span>
      <span>${schemaName}</span>
      <span class="badge">${tables.length}</span>
    </div>
    <div class="schema-tables collapsed">
      ${tables.map(table => createTableNode(schemaName, table)).join('')}
    </div>
  `;

  // Toggle expand/collapse
  node.querySelector('.schema-header').addEventListener('click', () => {
    node.querySelector('.schema-tables').classList.toggle('collapsed');
  });

  return node;
}

function createTableNode(schema, table) {
  return `
    <div class="table-node" data-schema="${schema}" data-table="${table.name}">
      <span class="icon" data-icon="Table" data-icon-size="14"></span>
      <span>${table.name}</span>
      <span class="table-info">${table.row_count} rows</span>
    </div>
  `;
}
```

#### 4.2 SQL Query Editor

**New File**: [`frontend/src/renderer/views/database/query.js`](frontend/src/renderer/views/database/query.js)

**Features**:

- SQL editor (Monaco with SQL syntax)
- Execute query button
- Results grid with AG-Grid
- Export results (CSV/JSON)
- Query history (stored in localStorage)
- Save queries for reuse
- Query execution time tracking
- Error handling and display

**UI Layout**:

```
┌──────────────────────────────────────────────────────────┐
│ SQL Query Editor                                         │
├──────────────────────────────────────────────────────────┤
│ [▶ Run Query]  [History ▼]  [Save]  [Clear]             │
├──────────────────────────────────────────────────────────┤
│ SELECT                                                   │
│   customer_id,                                           │
│   customer_name,                                         │
│   SUM(amount) as total                                   │
│ FROM landing.raw_csv_data                                │
│ WHERE amount > 100                                       │
│ GROUP BY customer_id, customer_name                      │
│ ORDER BY total DESC;                                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Results (2 rows in 0.05s):                [Export ▼]    │
│                                                          │
│ ┌─────────────┬───────────────┬─────────┐              │
│ │ customer_id │ customer_name │ total   │              │
│ ├─────────────┼───────────────┼─────────┤              │
│ │ 2           │ Bob           │ 250.00  │              │
│ │ 3           │ Charlie       │ 175.25  │              │
│ └─────────────┴───────────────┴─────────┘              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Implementation**:

```javascript
// frontend/src/renderer/views/database/query.js
import { MonacoWrapper } from '../editor/monaco-wrapper.js';
import { DataGrid } from '../../components/data-grid.js';

let queryEditor = null;
let resultsGrid = null;

export function initializeQueryEditor() {
  queryEditor = new MonacoWrapper('query-editor-container');
  queryEditor.init();
  queryEditor.setContent('', 'sql');

  resultsGrid = new DataGrid('query-results-container');

  setupQueryActions();
  loadQueryHistory();
}

async function executeQuery() {
  const sql = queryEditor.getContent();
  if (!sql.trim()) {
    showToast('Please enter a SQL query', 'warning');
    return;
  }

  const db = getState('currentDatabase');
  if (!db) {
    showToast('Please connect to a database first', 'error');
    return;
  }

  try {
    const startTime = performance.now();
    const result = await window.electronAPI.pipeline.query(db.path, sql);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    setState('queryResults', { ...result, duration });

    resultsGrid.setData(result.columns, result.rows);

    // Save to history
    saveToHistory(sql, result.rows.length, duration);

    showToast(`Query executed: ${result.rows.length} rows in ${duration}s`, 'success');

  } catch (error) {
    showToast(`Query error: ${error.message}`, 'error');
    console.error(error);
  }
}

function saveToHistory(sql, rowCount, duration) {
  const history = JSON.parse(localStorage.getItem('queryHistory') || '[]');
  history.unshift({
    sql,
    timestamp: new Date().toISOString(),
    rowCount,
    duration
  });

  // Keep last 50 queries
  localStorage.setItem('queryHistory', JSON.stringify(history.slice(0, 50)));
}

function loadQueryHistory() {
  const history = JSON.parse(localStorage.getItem('queryHistory') || '[]');
  renderQueryHistory(history);
}
```

#### 4.3 Data Grid Component

**Library**: **AG-Grid Community** (open source, Excel-like)

**Installation**:

```bash
npm install ag-grid-community
```

**New File**: [`frontend/src/renderer/components/data-grid.js`](frontend/src/renderer/components/data-grid.js)

**Purpose**: Reusable data grid wrapper

```javascript
// frontend/src/renderer/components/data-grid.js
import { createGrid } from 'ag-grid-community';

export class DataGrid {
  constructor(containerId) {
    this.containerId = containerId;
    this.gridApi = null;
  }

  init() {
    const container = document.getElementById(this.containerId);

    const gridOptions = {
      columnDefs: [],
      rowData: [],
      defaultColDef: {
        sortable: true,
        resizable: true,
        filter: true
      },
      pagination: true,
      paginationPageSize: 100,
      enableCellTextSelection: true,
      onGridReady: (params) => {
        this.gridApi = params.api;
      }
    };

    this.gridApi = createGrid(container, gridOptions);
  }

  setData(columns, rows) {
    if (!this.gridApi) return;

    // Convert columns array to AG-Grid column definitions
    const columnDefs = columns.map(col => ({
      field: col,
      headerName: col,
      sortable: true,
      filter: true
    }));

    this.gridApi.setGridOption('columnDefs', columnDefs);
    this.gridApi.setGridOption('rowData', rows);
  }

  exportToCsv() {
    if (this.gridApi) {
      this.gridApi.exportDataAsCsv();
    }
  }

  clear() {
    if (this.gridApi) {
      this.gridApi.setGridOption('rowData', []);
    }
  }
}
```

**Styling Integration**:

```css
/* frontend/src/renderer/styles/database.css */
@import 'ag-grid-community/styles/ag-grid.css';
@import 'ag-grid-community/styles/ag-theme-alpine.css';

/* Override AG-Grid theme with app theme colors */
.ag-theme-alpine {
  --ag-background-color: var(--color-bg-primary);
  --ag-foreground-color: var(--color-text-primary);
  --ag-header-background-color: var(--color-bg-secondary);
  --ag-odd-row-background-color: var(--color-bg-primary);
  --ag-row-hover-color: var(--color-bg-hover);
}
```

---

### Phase 5: Reports View

**Goal**: Display generated HTML reports and monitor pipeline execution

#### 5.1 Report List & Viewer

**File**: Replace [`frontend/src/renderer/views/reports/index.js`](frontend/src/renderer/views/reports/index.js)

**Features**:

- List all HTML reports from `reports/` directory
- View reports in sandboxed iframe
- Filter reports by:
  - Date (today, yesterday, last 7 days, last 30 days)
  - Pipeline name
  - Status (success, error, warning)
- Sort by date/name
- Delete old reports (with confirmation)
- Export/download reports
- Search reports by content

**UI Layout**:

```
┌──────────────────┬────────────────────────────────────────┐
│ Reports          │ pipeline_report_2025-01-15_15-30.html  │
│                  │                                        │
│ [Filters ▼]      │ [Download] [Delete] [Refresh]         │
│                  │                                        │
│ Today (2)        │ ┌────────────────────────────────────┐ │
│ ► pipeline_report│ │                                    │ │
│   15:30 ✓        │ │  [Rendered HTML Report in iframe]  │ │
│ ► reference_...  │ │                                    │ │
│   14:22 ✓        │ │  Pipeline Summary                  │ │
│                  │ │  ================================   │ │
│ Yesterday (1)    │ │  Name: Complete Reference          │ │
│ ► customers_...  │ │  Duration: 4.2s                    │ │
│   09:15 ⚠        │ │  Jobs: 15/15                       │ │
│                  │ │  Status: ✓ Success                 │ │
│ Last 7 Days (5)  │ │                                    │ │
│ ...              │ │  Stage Breakdown                   │ │
│                  │ │  • Extract: 3 jobs (2.1s)          │ │
│ [Clear Old]      │ │  • Stage: 1 job (0.5s)             │ │
│ [Settings]       │ │  • Transform: 9 jobs (1.2s)        │ │
│                  │ │  • Export: 2 jobs (0.4s)           │ │
└──────────────────┴────────────────────────────────────────┘
```

**Component Structure**:

```javascript
// frontend/src/renderer/views/reports/index.js
export function initializeReportsView() {
  loadReportsList();
  setupReportsActions();
}

async function loadReportsList() {
  const reports = await window.electronAPI.pipeline.listReports();

  // Group by date
  const grouped = groupReportsByDate(reports);

  setState('reports', reports);
  renderReportsList(grouped);
}

function groupReportsByDate(reports) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {
    today: [],
    yesterday: [],
    lastWeek: [],
    older: []
  };

  reports.forEach(report => {
    const reportDate = new Date(report.date);
    if (isSameDay(reportDate, today)) {
      groups.today.push(report);
    } else if (isSameDay(reportDate, yesterday)) {
      groups.yesterday.push(report);
    } else if (isWithinDays(reportDate, 7)) {
      groups.lastWeek.push(report);
    } else {
      groups.older.push(report);
    }
  });

  return groups;
}

async function viewReport(reportPath) {
  const content = await window.electronAPI.pipeline.readReport(reportPath);

  setState('currentReport', { path: reportPath, content });

  // Render in sandboxed iframe
  const iframe = document.getElementById('report-viewer-iframe');
  iframe.srcdoc = content;
}

async function deleteReport(reportPath) {
  const confirmed = await showConfirmDialog(
    'Delete Report',
    'Are you sure you want to delete this report? This cannot be undone.'
  );

  if (!confirmed) return;

  await window.electronAPI.file.delete(reportPath);
  await loadReportsList();

  showToast('Report deleted', 'success');
}
```

**Iframe Sandboxing**:

```html
<!-- Sandboxed iframe for security -->
<iframe
  id="report-viewer-iframe"
  sandbox="allow-same-origin"
  style="width: 100%; height: 100%; border: none;">
</iframe>
```

#### 5.2 Pipeline Execution Monitor

**New File**: [`frontend/src/renderer/views/reports/monitor.js`](frontend/src/renderer/views/reports/monitor.js)

**Features**:

- Real-time pipeline execution tracking
- Job progress visualization (progress bars)
- Stage completion indicators
- Live log streaming (reuse Dashboard log component)
- Error/warning highlighting
- Time elapsed/remaining estimation
- Stop execution button

**UI Layout**:

```
┌──────────────────────────────────────────────────────────┐
│ Execution Monitor: reference.yaml                        │
├──────────────────────────────────────────────────────────┤
│ [■ Stop]  [⏸ Pause]              Status: Running ⚙      │
│                                                          │
│ Progress: ████████░░░░░░░░░░░░░░ 8/15 jobs (53%)        │
│ Elapsed: 00:03:24  Estimated: 00:02:15 remaining        │
│                                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                          │
│ Stages:                                                  │
│                                                          │
│ ✓ extract    3/3 jobs completed                         │
│   ✓ extract_csv (2.1s)                                  │
│   ✓ extract_excel (1.8s)                                │
│   ✓ extract_xml (1.5s)                                  │
│                                                          │
│ ✓ stage      1/1 jobs completed                         │
│   ✓ stage_all (0.5s)                                    │
│                                                          │
│ ⚙ transform  4/9 jobs completed                         │
│   ✓ transform_sql_inline (0.3s)                         │
│   ✓ transform_sql_file (0.4s)                           │
│   ✓ transform_sql_yaml (0.2s)                           │
│   ⚙ transform_python_inline (running... 00:00:15)       │
│   ⏳ transform_python_file (pending)                     │
│   ⏳ transform_dbt (pending)                             │
│   ...                                                    │
│                                                          │
│ ⏳ export    0/2 jobs pending                            │
│   ⏳ export_csv (pending)                                │
│   ⏳ export_parquet (pending)                            │
│                                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                          │
│ Live Logs:                               [Filters ▼]    │
│                                                          │
│ [15:23:45] INFO: Starting transform_python_inline       │
│ [15:23:46] INFO: Loading input tables from DuckDB       │
│ [15:23:47] DEBUG: Executing Python function transform() │
│ [15:23:58] INFO: Processing 118 rows...                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Implementation**:

```javascript
// frontend/src/renderer/views/reports/monitor.js
export class ExecutionMonitor {
  constructor() {
    this.processId = null;
    this.startTime = null;
    this.jobs = [];
    this.currentJobIndex = 0;
  }

  async start(pipelinePath) {
    // Reset state
    this.startTime = Date.now();
    this.processId = null;
    this.jobs = [];

    // Set up listener for streaming output
    window.electronAPI.pipeline.onPipelineOutput(this.handleOutput.bind(this));

    // Execute pipeline with JSON output
    const result = await window.electronAPI.pipeline.execute(pipelinePath, {
      json: true
    });

    this.processId = result.processId;

    setState('pipelineExecutionStatus', {
      status: 'running',
      progress: 0,
      startTime: this.startTime
    });
  }

  handleOutput(data) {
    if (data.processId !== this.processId) return;

    const log = data.log;

    // Parse JSON-Lines output from backend
    if (log.type === 'job_start') {
      this.onJobStart(log);
    } else if (log.type === 'job_complete') {
      this.onJobComplete(log);
    } else if (log.type === 'job_error') {
      this.onJobError(log);
    } else if (log.type === 'pipeline_complete') {
      this.onPipelineComplete(log);
    }

    // Also display in logs section
    this.appendLog(log);

    // Update progress
    this.updateProgress();
  }

  onJobStart(log) {
    const job = {
      name: log.job_name,
      stage: log.stage,
      status: 'running',
      startTime: Date.now()
    };

    this.jobs.push(job);
    this.currentJobIndex = this.jobs.length - 1;

    this.renderJobStatus(job);
  }

  onJobComplete(log) {
    const job = this.jobs[this.currentJobIndex];
    if (job) {
      job.status = 'completed';
      job.duration = log.duration;
      this.renderJobStatus(job);
    }
  }

  onJobError(log) {
    const job = this.jobs[this.currentJobIndex];
    if (job) {
      job.status = 'error';
      job.error = log.error;
      this.renderJobStatus(job);
    }

    setState('pipelineExecutionStatus', {
      status: 'error',
      error: log.error
    });
  }

  onPipelineComplete(log) {
    setState('pipelineExecutionStatus', {
      status: log.success ? 'success' : 'error',
      progress: 1,
      duration: log.duration
    });

    // Clean up listener
    window.electronAPI.pipeline.removePipelineOutput(this.handleOutput);

    // Show completion notification
    const message = log.success
      ? `Pipeline completed successfully in ${log.duration}s`
      : `Pipeline failed: ${log.error}`;

    showToast(message, log.success ? 'success' : 'error');
  }

  updateProgress() {
    const total = this.jobs.length;
    const completed = this.jobs.filter(j => j.status === 'completed').length;
    const progress = total > 0 ? completed / total : 0;

    setState('pipelineExecutionStatus', state => ({
      ...state,
      progress
    }));

    this.renderProgressBar(progress);
  }

  renderJobStatus(job) {
    // Render job in appropriate stage section with status icon
    const statusIcon = {
      running: '⚙',
      completed: '✓',
      error: '✗',
      pending: '⏳'
    }[job.status];

    // ... DOM manipulation
  }

  async stop() {
    if (this.processId) {
      await window.electronAPI.pipeline.stop(this.processId);
      setState('pipelineExecutionStatus', { status: 'stopped' });
      showToast('Pipeline execution stopped', 'warning');
    }
  }
}
```

**Integration with Pipeline Builder**:

```javascript
// In pipeline builder, add "Run & Monitor" button
async function runAndMonitor(pipelinePath) {
  // Switch to Reports view
  setState('currentView', 'reports');
  document.getElementById('reports-view').classList.add('active');

  // Start monitoring
  const monitor = new ExecutionMonitor();
  await monitor.start(pipelinePath);
}
```

---

### Phase 6: Integration & Polish

**Goal**: Tie everything together and ensure consistent UX

#### 6.1 Navigation Updates

**File**: [`frontend/src/renderer/index.html`](frontend/src/renderer/index.html)

**Changes**:

1. Update sidebar navigation labels to reflect new functionality
2. Add sub-navigation within complex views
3. Update view IDs and classes

```html
<!-- Updated sidebar navigation -->
<aside class="sidebar sidebar-collapsed">
  <nav class="sidebar-nav">
    <button class="nav-item active" data-view="dashboard">
      <span class="nav-icon" data-icon="LayoutDashboard" data-icon-size="18"></span>
      <span>Dashboard</span>
    </button>

    <!-- Updated label -->
    <button class="nav-item" data-view="pipeline">
      <span class="nav-icon" data-icon="GitBranch" data-icon-size="18"></span>
      <span>Pipeline Builder</span>
    </button>

    <!-- Updated label -->
    <button class="nav-item" data-view="editor">
      <span class="nav-icon" data-icon="Code" data-icon-size="18"></span>
      <span>Transform Editor</span>
    </button>

    <!-- Updated label -->
    <button class="nav-item" data-view="database">
      <span class="nav-icon" data-icon="Database" data-icon-size="18"></span>
      <span>Database Explorer</span>
    </button>

    <!-- Updated label -->
    <button class="nav-item" data-view="reports">
      <span class="nav-icon" data-icon="BarChart3" data-icon-size="18"></span>
      <span>Reports & Monitor</span>
    </button>
  </nav>

  <div class="sidebar-footer">
    <div class="version-info">Loading...</div>
  </div>
</aside>
```

**Update Protected Views**:

```javascript
// frontend/src/renderer/components/sidebar.js
const PROTECTED_VIEWS = ['pipeline', 'editor', 'database', 'reports'];
```

#### 6.2 Settings Integration

**File**: [`frontend/src/renderer/dialogs/settings/index.js`](frontend/src/renderer/dialogs/settings/index.js)

**New Settings Tab**: "Pipeline Configuration"

**New Settings**:

```javascript
// Add to settings state
{
  // Existing settings...
  rootFolder: '',
  theme: 'catppuccin-frappe',
  pythonPath: 'python',

  // NEW Pipeline settings
  etlBackendPath: '',              // Path to backend/ directory
  pipelineConfigPath: '',          // Path to schema/pipeline.yaml
  databasePath: '',                // Path to out/db/
  transformsPath: '',              // Path to schema/transforms/
  reportsPath: '',                 // Path to reports/

  // Pipeline execution settings
  defaultValidateBeforeRun: true,  // Always validate before running
  autoRefreshInterval: 5000,       // ms for monitor refresh
  maxLogLines: 1000,               // Max lines in log view
  autoGenerateReports: true,       // Generate HTML report after run

  // Database settings
  queryTimeout: 30000,             // ms for query timeout
  maxQueryResults: 10000,          // Max rows to return
  enableReadOnlyMode: true         // Prevent accidental writes
}
```

**Settings Dialog UI**:

```html
<!-- New tab in settings dialog -->
<div class="settings-section" data-section="pipeline">
  <h3>Pipeline Configuration</h3>

  <div class="setting-group">
    <label>Backend Directory</label>
    <div class="input-with-button">
      <input type="text" id="setting-etl-backend-path" />
      <button class="btn-secondary" data-action="browse-directory">Browse</button>
    </div>
    <small>Path to the ETL pipeline backend directory</small>
  </div>

  <div class="setting-group">
    <label>Pipeline Config Path</label>
    <div class="input-with-button">
      <input type="text" id="setting-pipeline-config-path" />
      <button class="btn-secondary" data-action="browse-file">Browse</button>
    </div>
    <small>Path to schema/pipeline.yaml file</small>
  </div>

  <!-- More settings... -->

  <div class="setting-group">
    <label>
      <input type="checkbox" id="setting-validate-before-run" />
      Validate pipeline before running
    </label>
  </div>

  <div class="setting-group">
    <label>
      <input type="checkbox" id="setting-auto-generate-reports" />
      Automatically generate HTML reports
    </label>
  </div>
</div>
```

#### 6.3 Command Palette Extensions

**File**: [`frontend/src/renderer/utils/command-registry.js`](frontend/src/renderer/utils/command-registry.js)

**New Commands**:

```javascript
// Add to command registry
export const COMMANDS = [
  // ... existing commands ...

  // Pipeline commands
  {
    id: 'pipeline-new',
    title: 'Pipeline: New',
    description: 'Create a new pipeline',
    icon: 'Plus',
    action: () => {
      setState('currentView', 'pipeline');
      // Open new pipeline dialog
    }
  },
  {
    id: 'pipeline-validate',
    title: 'Pipeline: Validate Current',
    description: 'Validate the currently open pipeline',
    icon: 'CheckCircle',
    action: () => {
      // Validate current pipeline
    }
  },
  {
    id: 'pipeline-execute',
    title: 'Pipeline: Execute',
    description: 'Run the current pipeline',
    icon: 'Play',
    action: () => {
      // Execute pipeline
    }
  },

  // Transform commands
  {
    id: 'transform-new-sql',
    title: 'Transform: New SQL File',
    description: 'Create a new SQL transformation',
    icon: 'FileCode',
    action: () => {
      // Open SQL template dialog
    }
  },
  {
    id: 'transform-new-python',
    title: 'Transform: New Python File',
    description: 'Create a new Python transformation',
    icon: 'FileCode',
    action: () => {
      // Open Python template dialog
    }
  },

  // Database commands
  {
    id: 'database-connect',
    title: 'Database: Connect',
    description: 'Connect to a database',
    icon: 'Database',
    action: () => {
      setState('currentView', 'database');
    }
  },
  {
    id: 'database-query',
    title: 'Database: Run Query',
    description: 'Open SQL query editor',
    icon: 'Terminal',
    action: () => {
      setState('currentView', 'database');
      // Switch to query tab
    }
  },

  // Reports commands
  {
    id: 'reports-latest',
    title: 'Reports: View Latest',
    description: 'View the most recent report',
    icon: 'FileText',
    action: () => {
      setState('currentView', 'reports');
      // Load latest report
    }
  }
];
```

#### 6.4 Keyboard Shortcuts

**File**: [`frontend/src/renderer/utils/keyboard-shortcuts.js`](frontend/src/renderer/utils/keyboard-shortcuts.js)

**New Shortcuts**:

```javascript
// Add to keyboard shortcuts
export const SHORTCUTS = {
  // ... existing shortcuts ...

  // File operations
  'Ctrl+N': () => {
    // Context-aware new: pipeline, file, etc.
    const view = getState('currentView');
    if (view === 'pipeline') {
      // New pipeline
    } else if (view === 'editor') {
      // New transform file
    }
  },

  'Ctrl+S': () => {
    // Save current file
    const view = getState('currentView');
    if (view === 'editor' && getState('unsavedChanges')) {
      // Save current file in editor
    } else if (view === 'pipeline') {
      // Save pipeline config
    }
  },

  // Pipeline operations
  'Ctrl+Shift+V': () => {
    // Validate pipeline
    if (getState('currentView') === 'pipeline') {
      // Run validation
    }
  },

  'Ctrl+Shift+E': () => {
    // Execute pipeline
    if (getState('currentView') === 'pipeline') {
      // Run pipeline
    }
  },

  // View operations
  'F5': () => {
    // Refresh current view
    const view = getState('currentView');
    // Reload view data
  },

  'Ctrl+Shift+Q': () => {
    // Open query editor
    setState('currentView', 'database');
    // Focus query editor
  },

  // Search
  'Ctrl+F': (e) => {
    e.preventDefault();
    // Context-aware search
    const view = getState('currentView');
    // Show search in current view
  }
};
```

**Keyboard Shortcuts Help Dialog**:

Update the keyboard shortcuts dialog to include new shortcuts:

```javascript
// frontend/src/renderer/dialogs/keyboard-shortcuts.js
const SHORTCUT_CATEGORIES = [
  // ... existing categories ...

  {
    category: 'Pipeline',
    shortcuts: [
      { keys: ['Ctrl', 'N'], description: 'New pipeline or file' },
      { keys: ['Ctrl', 'S'], description: 'Save current file' },
      { keys: ['Ctrl', 'Shift', 'V'], description: 'Validate pipeline' },
      { keys: ['Ctrl', 'Shift', 'E'], description: 'Execute pipeline' }
    ]
  },
  {
    category: 'Database',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'Q'], description: 'Open query editor' },
      { keys: ['F5'], description: 'Refresh view' }
    ]
  }
];
```

#### 6.5 Theme Consistency

**Ensure all new views respect the theme system**:

**New CSS Files**:

1. [`frontend/src/renderer/styles/pipeline.css`](frontend/src/renderer/styles/pipeline.css)
2. [`frontend/src/renderer/styles/editor.css`](frontend/src/renderer/styles/editor.css)
3. [`frontend/src/renderer/styles/database.css`](frontend/src/renderer/styles/database.css)
4. [`frontend/src/renderer/styles/reports.css`](frontend/src/renderer/styles/reports.css)

**Use CSS Custom Properties**:

```css
/* All new styles should use theme variables */
.pipeline-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.pipeline-card:hover {
  background: var(--color-bg-hover);
}

.job-status-success {
  color: var(--color-success);
}

.job-status-error {
  color: var(--color-error);
}

.job-status-running {
  color: var(--color-warning);
}
```

**Import in main.css**:

```css
/* frontend/src/renderer/styles/main.css */
@import 'pipeline.css';
@import 'editor.css';
@import 'database.css';
@import 'reports.css';
```

#### 6.6 Error Handling & User Feedback

**Standardized Error Handling**:

```javascript
// frontend/src/renderer/utils/error-handler.js
export function handleError(error, context) {
  console.error(`Error in ${context}:`, error);

  let message = error.message || 'An unexpected error occurred';

  // User-friendly messages for common errors
  if (error.code === 'ENOENT') {
    message = 'File not found. Please check the path.';
  } else if (error.code === 'EACCES') {
    message = 'Permission denied. Check file permissions.';
  } else if (error.message.includes('YAML')) {
    message = 'Invalid YAML syntax. Please check your configuration.';
  } else if (error.message.includes('Python')) {
    message = 'Python execution error. Check your Python installation.';
  }

  showToast(message, 'error');

  // Log to file for debugging (optional)
  window.electronAPI.logError({ context, error: error.toString() });
}
```

**Loading States**:

```javascript
// Show loading indicator for async operations
async function withLoading(operation, loadingMessage = 'Loading...') {
  showLoadingOverlay(loadingMessage);

  try {
    const result = await operation();
    return result;
  } catch (error) {
    handleError(error, 'async operation');
  } finally {
    hideLoadingOverlay();
  }
}

// Usage
await withLoading(
  async () => {
    const pipelines = await window.electronAPI.pipeline.list();
    renderPipelines(pipelines);
  },
  'Loading pipelines...'
);
```

**Confirmation Dialogs**:

```javascript
// Standardized confirmation dialog
async function showConfirmDialog(title, message, type = 'warning') {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <div class="confirm-dialog-content">
        <div class="confirm-dialog-icon ${type}">
          <span data-icon="${getIconForType(type)}" data-icon-size="32"></span>
        </div>
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-dialog-actions">
          <button class="btn-secondary" data-action="cancel">Cancel</button>
          <button class="btn-primary ${type}" data-action="confirm">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    initializeIcons(dialog);

    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      dialog.remove();
      resolve(false);
    });

    dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      dialog.remove();
      resolve(true);
    });
  });
}
```

---

## File Structure

### New Files Summary

```
frontend/
├── src/
│   ├── main/
│   │   ├── ipc/
│   │   │   ├── pipeline.js          # NEW - Pipeline IPC handlers
│   │   │   └── database.js          # NEW - Database query handlers
│   │   │
│   │   └── index.js                 # MODIFIED - Register new IPC handlers
│   │
│   ├── preload/
│   │   └── index.js                 # MODIFIED - Expose new APIs
│   │
│   └── renderer/
│       ├── views/
│       │   ├── pipeline/            # NEW - Pipeline Builder
│       │   │   ├── index.js
│       │   │   ├── editor.js
│       │   │   ├── job-editor.js
│       │   │   └── runner-configs.js
│       │   │
│       │   ├── editor/              # REPLACE - Transform Editor
│       │   │   ├── index.js
│       │   │   ├── monaco-wrapper.js
│       │   │   └── templates.js
│       │   │
│       │   ├── database/            # REPLACE - Database Explorer
│       │   │   ├── index.js
│       │   │   ├── query.js
│       │   │   └── schema-tree.js
│       │   │
│       │   └── reports/             # REPLACE - Reports Viewer
│       │       ├── index.js
│       │       └── monitor.js
│       │
│       ├── components/
│       │   ├── data-grid.js         # NEW - AG-Grid wrapper
│       │   ├── yaml-editor.js       # NEW - YAML form builder (optional)
│       │   └── file-tree.js         # NEW - File explorer component
│       │
│       ├── styles/
│       │   ├── pipeline.css         # NEW
│       │   ├── editor.css           # NEW
│       │   ├── database.css         # NEW
│       │   └── reports.css          # NEW
│       │
│       ├── utils/
│       │   └── error-handler.js     # NEW - Centralized error handling
│       │
│       ├── core/
│       │   └── state.js             # MODIFIED - Add pipeline state
│       │
│       ├── dialogs/
│       │   └── settings/
│       │       └── index.js         # MODIFIED - Add pipeline settings
│       │
│       └── index.html               # MODIFIED - Update navigation
│
└── package.json                     # MODIFIED - Add dependencies
```

---

## Technical Dependencies

### New NPM Packages

```json
{
  "dependencies": {
    // Existing dependencies preserved...
    "electron": "^38.0.0",

    // NEW dependencies
    "monaco-editor": "^0.52.0",     // Code editor
    "ag-grid-community": "^32.0.0", // Data grid
    "js-yaml": "^4.1.0",            // YAML parsing/serialization
    "ansi-to-html": "^0.7.2"        // Terminal output formatting
  },
  "devDependencies": {
    // Existing dev dependencies preserved...

    // NEW dev dependencies (if using Webpack)
    "monaco-editor-webpack-plugin": "^7.1.0"
  }
}
```

### Backend Requirements

**NO changes to backend Python code required**

**Leverage existing CLI interface**:
- `python -m pipeline.cli --pipeline config.yaml --json` for structured output
- `python -m pipeline.cli --pipeline config.yaml --validate` for validation
- `python -m pipeline.cli --pipeline config.yaml --dry-run` for planning

**File system access required**:
- `schema/pipeline.yaml` - Read/write pipeline configuration
- `schema/transforms/` - Read/write SQL and Python transform files
- `out/db/` - Connect to DuckDB/SQLite databases
- `reports/` - Read generated HTML reports

**DuckDB CLI** (optional, for direct queries):
```bash
npm install duckdb  # Node.js DuckDB bindings (optional)
```

---

## Implementation Priorities

### Must Have (MVP - Phase 1)

✅ **Infrastructure**
- IPC handlers for pipeline/database/file operations
- State management extensions
- Preload API exposure

✅ **Pipeline Builder**
- Pipeline list view
- Pipeline editor (metadata, variables, database, jobs)
- Job editor with runner-specific forms
- Validate & Execute pipeline

✅ **Transform Editor**
- Basic file manager
- Monaco editor integration
- File read/write operations

✅ **Database Explorer**
- Database connection
- Schema tree browser
- Table preview

✅ **Reports**
- Report list
- Report viewer (iframe)

### Should Have (V2 - Phase 2)

🔶 **Pipeline Builder Enhancements**
- Pipeline templates (import/export)
- Duplicate/delete pipelines
- Dependency graph visualization
- Real-time YAML preview

🔶 **Transform Editor Enhancements**
- SQL query editor with results
- Transform file templates
- Syntax validation
- File search

🔶 **Database Explorer Enhancements**
- Query history & saved queries
- Export table data
- Database statistics

🔶 **Reports Enhancements**
- Real-time execution monitor
- Filter/search reports
- Report comparison

### Nice to Have (Future - Phase 3)

💡 **Advanced Pipeline Builder**
- Drag-and-drop pipeline builder
- Visual data lineage graph
- Pipeline version control
- Multi-pipeline execution

💡 **Advanced Transform Editor**
- Code completion for Polars/SQL
- Inline documentation
- Debug mode

💡 **Advanced Database**
- Schema visualization
- Query performance analysis
- Database migrations

💡 **Advanced Reports**
- Custom report templates
- Scheduled pipeline execution
- Email/Slack notifications
- Alert configuration

---

## Success Criteria

### Functional Requirements

✅ User can create a complete pipeline without manually editing YAML
✅ User can write SQL/Python transforms with syntax highlighting
✅ User can browse database tables and run queries
✅ User can view generated HTML reports
✅ All operations preserve backend compatibility (no backend changes)
✅ Real-time log streaming during pipeline execution

### Non-Functional Requirements

✅ Admin authentication gates pipeline editing
✅ Theme system works across all new views
✅ Responsive UI (handles large pipelines gracefully)
✅ Proper error handling with user-friendly messages
✅ Keyboard shortcuts for common operations
✅ No data loss (auto-save, confirmation dialogs)

### Performance Requirements

✅ Pipeline list loads in < 1 second (for 100 pipelines)
✅ Editor opens files in < 500ms
✅ Database queries return in < 5 seconds (with timeout)
✅ Real-time log streaming with < 100ms latency

---

## Timeline & Resources

### Estimated Timeline

**With 1 Developer**:

- **Phase 1 (Infrastructure)**: 2-3 days
  - IPC handlers, state management, preload API

- **Phase 2 (Pipeline Builder)**: 4-5 days
  - Pipeline list, editor, job forms, validation

- **Phase 3 (Transform Editor)**: 3-4 days
  - File manager, Monaco integration, templates

- **Phase 4 (Database Explorer)**: 3-4 days
  - Schema browser, query editor, data grid

- **Phase 5 (Reports)**: 2-3 days
  - Report viewer, execution monitor

- **Phase 6 (Integration & Polish)**: 2-3 days
  - Navigation, settings, keyboard shortcuts, testing

**Total**: ~3-4 weeks for MVP

**With 2 Developers** (parallel workstreams):
- **Total**: ~2-3 weeks for MVP

### Resource Requirements

**Development**:
- 1-2 Frontend developers (JavaScript/Electron experience)
- Access to Python ETL backend for testing
- Test data and sample pipelines

**Design**:
- UI/UX consistency review (leverage existing design system)
- Icon set (already available via Lucide icons)

**Testing**:
- Manual testing across all views
- Cross-platform testing (Windows, macOS, Linux)
- Integration testing with real pipelines

**Documentation**:
- User guide for new features
- Developer guide for extending the system
- Video tutorials (optional)

---

## Risk Mitigation

### Technical Risks

**Risk**: Monaco Editor bundle size (>5MB)
**Mitigation**:
- Use web worker for background parsing
- Lazy load editor only when needed
- Consider CodeMirror as lightweight alternative

**Risk**: Complex YAML editing prone to errors
**Mitigation**:
- Heavy client-side validation before save
- Form-based input with validation
- Template-based creation
- Automatic backup before overwrite

**Risk**: Database connection issues (locked DB, permissions)
**Mitigation**:
- Read-only queries by default
- Connection pooling
- Proper error messages
- Timeout handling

**Risk**: Pipeline execution blocking UI
**Mitigation**:
- Background processes with IPC streaming
- Cancel/stop functionality
- Progress indicators
- Web worker for heavy operations (optional)

**Risk**: Large database result sets crashing renderer
**Mitigation**:
- Pagination (100 rows per page)
- Row limit enforcement (10,000 max)
- Streaming results (future enhancement)

### UX Risks

**Risk**: Overwhelming UI for beginners
**Mitigation**:
- Wizard-style pipeline creation
- Contextual help tooltips
- Template library
- Progressive disclosure

**Risk**: Data loss from unsaved changes
**Mitigation**:
- Auto-save drafts to localStorage
- Confirmation dialogs before destructive actions
- Visual indicators for unsaved changes
- Undo/redo functionality (future)

### Process Risks

**Risk**: Scope creep
**Mitigation**:
- Strict MVP definition
- Phased approach (Must Have → Should Have → Nice to Have)
- Regular stakeholder check-ins

**Risk**: Backend breaking changes
**Mitigation**:
- Version-lock Python dependencies
- Comprehensive integration tests
- Fallback to CLI if API changes

---

## Testing Strategy

### Unit Tests

- State management functions
- IPC handler logic
- Form validation
- YAML parsing/serialization

### Integration Tests

- Pipeline CRUD operations
- File read/write
- Database queries
- Pipeline execution

### End-to-End Tests

- Create pipeline from scratch
- Edit and save transform files
- Run query and export results
- Execute pipeline and view report

### Manual Testing Checklist

**Pipeline Builder**:
- [ ] Create new pipeline
- [ ] Edit existing pipeline
- [ ] Add/remove jobs
- [ ] Configure job dependencies
- [ ] Validate pipeline
- [ ] Execute pipeline
- [ ] Handle validation errors

**Transform Editor**:
- [ ] Create SQL file
- [ ] Create Python file
- [ ] Edit and save files
- [ ] Syntax highlighting works
- [ ] Templates load correctly

**Database Explorer**:
- [ ] Connect to database
- [ ] Browse schema tree
- [ ] Preview table data
- [ ] Execute SQL query
- [ ] Export results
- [ ] Handle query errors

**Reports**:
- [ ] List reports
- [ ] View report
- [ ] Delete report
- [ ] Monitor execution
- [ ] Real-time logs

**Cross-Cutting**:
- [ ] Theme switching works in all views
- [ ] Admin login required for protected views
- [ ] Keyboard shortcuts work
- [ ] Command palette includes new commands
- [ ] Settings persist across restarts
- [ ] Error handling shows user-friendly messages

---

## Future Enhancements

### Version 2.0

1. **Visual Pipeline Builder**
   - Drag-and-drop job nodes
   - Visual dependency connections
   - Real-time validation
   - Auto-layout algorithm

2. **Advanced Transform Editor**
   - Code completion (Polars methods, SQL keywords)
   - Inline documentation
   - Refactoring tools
   - Debugging support

3. **Data Lineage Visualization**
   - Interactive graph showing data flow
   - Click to navigate to job/table
   - Impact analysis (what depends on this table?)

4. **Pipeline Scheduling**
   - Cron-style scheduling
   - Trigger on file changes
   - Email notifications on completion/error

5. **Collaboration Features**
   - Git integration for version control
   - Comments on jobs
   - Change tracking
   - Multi-user support

### Version 3.0

1. **Cloud Integration**
   - Run pipelines in cloud (AWS Lambda, Azure Functions)
   - Cloud storage (S3, Azure Blob)
   - Centralized pipeline registry

2. **AI-Assisted Features**
   - Natural language to SQL/Python
   - Suggest transformations based on data
   - Auto-generate documentation
   - Anomaly detection

3. **Advanced Monitoring**
   - Performance profiling
   - Resource usage tracking
   - Cost estimation
   - Historical execution trends

---

## Conclusion

This plan provides a comprehensive roadmap for transforming the Electron frontend into a full-featured ETL Pipeline Management GUI. By following a phased approach and maintaining zero backend changes, we can deliver a powerful visual interface while preserving the stability and flexibility of the existing Python ETL framework.

The key to success is:
1. **Start with solid infrastructure** (Phase 1)
2. **Build core features incrementally** (Phases 2-5)
3. **Polish and integrate** (Phase 6)
4. **Iterate based on user feedback** (Future versions)

With this approach, users will be able to visually create, manage, and monitor their entire ETL pipeline workflow without ever needing to manually edit YAML files or write boilerplate code.
