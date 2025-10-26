/**
 * Pipeline Builder View
 * Main view for listing and managing pipelines
 */

import { state, setState, getState, subscribe } from '../../core/state.js';
import { initializeIcons } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';
import { showConfirm } from '../../components/confirm.js';
import { handleError, withErrorHandling } from '../../utils/error-handler.js';
import { openPipelineEditor } from './editor.js';

/**
 * Initialize pipeline view
 */
export async function initializePipelineView() {
  setupEventListeners();
  await loadPipelines();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // New pipeline button
  const newBtn = document.getElementById('pipeline-new-btn');
  if (newBtn) {
    newBtn.addEventListener('click', createNewPipeline);
  }

  // Refresh button
  const refreshBtn = document.getElementById('pipeline-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadPipelines());
  }

  // Search input
  const searchInput = document.getElementById('pipeline-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterPipelines(e.target.value);
    });
  }

  // Delegate click events for pipeline cards
  document.addEventListener('click', handlePipelineActions);
}

/**
 * Load pipelines from backend
 */
async function loadPipelines() {
  const result = await withErrorHandling(
    async () => {
      const settings = await window.electronAPI.getSettings();
      const directory = settings.pipelineConfigPath || settings.etlBackendPath;

      if (!directory) {
        showToast('Pipeline directory not configured. Please set it in Settings.', 'warning');
        return { success: true, pipelines: [] };
      }

      return await window.electronAPI.pipeline.list(directory);
    },
    'Load Pipelines',
    { showLoading: true, loadingMessage: 'Loading pipelines...' }
  );

  if (result) {
    setState('pipelines', result.pipelines || []);
    renderPipelines(result.pipelines || []);
  }
}

/**
 * Render pipeline list
 */
function renderPipelines(pipelines) {
  const container = document.getElementById('pipeline-list');
  if (!container) return;

  if (pipelines.length === 0) {
    container.innerHTML = `
      <div class="empty-state-small">
        <span data-icon="FileText" data-icon-size="32"></span>
        <p>No Pipelines Found</p>
        <small>Create a new pipeline to get started</small>
      </div>
    `;
    initializeIcons(container);
    return;
  }

  container.innerHTML = pipelines.map(pipeline => createPipelineCard(pipeline)).join('');
  initializeIcons(container);
}

/**
 * Create pipeline card HTML
 */
function createPipelineCard(pipeline) {
  const lastModified = new Date(pipeline.lastModified).toLocaleString();
  const sizeKB = (pipeline.size / 1024).toFixed(1);

  return `
    <div class="pipeline-card" data-pipeline-path="${pipeline.path}">
      <div class="pipeline-card-header">
        <div class="pipeline-card-title">
          <span data-icon="FileCode" data-icon-size="18"></span>
          <span class="pipeline-name">${pipeline.name}</span>
        </div>
        <div class="pipeline-card-actions">
          <button class="icon-btn" data-action="validate" data-path="${pipeline.path}" title="Validate">
            <span data-icon="CheckCircle2" data-icon-size="14"></span>
          </button>
          <button class="icon-btn" data-action="edit" data-path="${pipeline.path}" title="Edit">
            <span data-icon="PencilLine" data-icon-size="14"></span>
          </button>
          <button class="icon-btn" data-action="execute" data-path="${pipeline.path}" title="Run">
            <span data-icon="Play" data-icon-size="14"></span>
          </button>
          <button class="icon-btn" data-action="delete" data-path="${pipeline.path}" title="Delete">
            <span data-icon="Trash2" data-icon-size="14"></span>
          </button>
        </div>
      </div>
      <div class="pipeline-card-meta">
        <span class="pipeline-meta-item">
          <span data-icon="Clock" data-icon-size="12"></span>
          ${lastModified}
        </span>
        <span class="pipeline-meta-item">
          <span data-icon="HardDrive" data-icon-size="12"></span>
          ${sizeKB} KB
        </span>
      </div>
    </div>
  `;
}

/**
 * Handle pipeline action clicks
 */
async function handlePipelineActions(e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const path = button.dataset.path;

  switch (action) {
    case 'edit':
      await editPipeline(path);
      break;
    case 'validate':
      await validatePipeline(path);
      break;
    case 'execute':
      await executePipeline(path);
      break;
    case 'delete':
      await deletePipeline(path);
      break;
  }
}

/**
 * Create new pipeline
 */
async function createNewPipeline() {
  const settings = await window.electronAPI.getSettings();
  let directory = settings.pipelineConfigPath || settings.etlBackendPath;

  if (!directory) {
    showToast('Pipeline directory not configured. Please set it in Settings.', 'error');
    return;
  }

  // If directory is the backend path, append 'schema' subdirectory
  // This ensures pipelines are created in backend/schema folder
  if (directory === settings.etlBackendPath) {
    directory = `${directory}/schema`;
  }

  // Create a default pipeline template
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultContent = `pipeline:
  name: "New Pipeline"
  version: "1.0"
  description: "Created on ${new Date().toLocaleString()}"

variables:
  DATA_DIR: "data"
  OUTPUT_DIR: "out/exports"

databases:
  warehouse:
    type: duckdb
    path: "out/db/warehouse.duckdb"
    reset_on_start: false
    schemas:
      - landing
      - staging
      - analytics

stages:
  - extract
  - stage
  - transform
  - export

jobs: {}
`;

  const newPath = `${directory}/pipeline_${timestamp}.yaml`;

  const result = await withErrorHandling(
    async () => await window.electronAPI.pipeline.write(newPath, defaultContent),
    'Create Pipeline'
  );

  if (result && result.success) {
    showToast('Pipeline created successfully', 'success');
    await loadPipelines();
    await editPipeline(newPath);
  }
}

/**
 * Edit pipeline
 */
async function editPipeline(path) {
  const result = await withErrorHandling(
    async () => await window.electronAPI.pipeline.read(path),
    'Load Pipeline'
  );

  if (result && result.success) {
    openPipelineEditor(path, result.content);
  }
}

/**
 * Validate pipeline
 */
async function validatePipeline(path) {
  const result = await withErrorHandling(
    async () => await window.electronAPI.pipeline.validate(path),
    'Validate Pipeline',
    { showLoading: true, loadingMessage: 'Validating pipeline...' }
  );

  if (result) {
    if (result.valid) {
      showToast('✓ Pipeline is valid', 'success');
    } else {
      const errorCount = result.errors?.length || 0;
      const warningCount = result.warnings?.length || 0;
      showToast(
        `Validation failed: ${errorCount} errors, ${warningCount} warnings`,
        'error'
      );
      console.error('Validation errors:', result.errors);
      console.warn('Validation warnings:', result.warnings);
    }
  }
}

/**
 * Execute pipeline
 */
async function executePipeline(path) {
  // Switch to dashboard view for logs
  setState('currentView', 'dashboard');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('dashboard-view')?.classList.add('active');

  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === 'dashboard');
  });

  showToast('Executing pipeline... Check logs in Dashboard', 'info');

  // Execute
  const result = await withErrorHandling(
    async () => await window.electronAPI.pipeline.execute(path, { json: true }),
    'Execute Pipeline'
  );

  if (result && result.success) {
    setState('pipelineExecutionStatus', {
      status: 'running',
      processId: result.processId,
      startTime: Date.now()
    });
  }
}

/**
 * Delete pipeline
 */
async function deletePipeline(path) {
  const pipelineName = path.split(/[/\\]/).pop();

  const confirmed = await showConfirm(
    `Are you sure you want to delete "${pipelineName}"? This action cannot be undone.`,
    {
      title: 'Delete Pipeline',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'error'
    }
  );

  if (!confirmed) return;

  const result = await withErrorHandling(
    async () => await window.electronAPI.file.delete(path),
    'Delete Pipeline'
  );

  if (result && result.success) {
    showToast('Pipeline deleted', 'success');
    await loadPipelines();
  }
}

/**
 * Filter pipelines by search term
 */
function filterPipelines(searchTerm) {
  const pipelines = getState('pipelines');
  if (!pipelines) return;

  const filtered = searchTerm
    ? pipelines.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : pipelines;

  renderPipelines(filtered);
}
