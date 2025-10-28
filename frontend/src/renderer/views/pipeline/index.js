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
import { extractData } from '../../utils/ipc-handler.js';

/**
 * Initialize pipeline view (wrapped with error boundary)
 */
export async function initializePipelineView() {
  try {
    setupEventListeners();
    await loadPipelines();
  } catch (error) {
    console.error('Pipeline Builder initialization failed:', error);

    // Display error UI
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-boundary-component';
    errorContainer.innerHTML = `
      <div class="error-boundary-icon">⚠️</div>
      <h3 class="error-boundary-title">Pipeline Builder Failed to Load</h3>
      <p class="error-boundary-message">${error.message}</p>
      <div class="error-boundary-actions">
        <button class="error-boundary-btn" onclick="location.reload()">Reload Application</button>
      </div>
    `;

    const targetElement = document.getElementById('pipeline-view');
    if (targetElement) {
      targetElement.appendChild(errorContainer);
    }

    // Custom recovery logic
    setState('pipelineViewAvailable', false);
  }
}

let listenersAttached = false;

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Prevent duplicate listeners
  if (listenersAttached) return;
  listenersAttached = true;

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

  // Delegate click events for pipeline cards (scoped to pipeline list)
  const pipelineView = document.getElementById('pipeline-view');
  if (pipelineView) {
    pipelineView.addEventListener('click', handlePipelineActions);
  }
}

/**
 * Load pipelines from backend
 */
async function loadPipelines() {
  const result = await withErrorHandling(
    async () => {
      const response = await window.electronAPI.getSettings();
      const settings = extractData(response, 'settings');
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
          <button class="icon-btn" data-action="duplicate" data-path="${pipeline.path}" title="Duplicate">
            <span data-icon="Copy" data-icon-size="14"></span>
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
    case 'duplicate':
      await duplicatePipeline(path);
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
  const response = await window.electronAPI.getSettings();
  const settings = extractData(response, 'settings');
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

      // Show detailed validation results in a dialog
      showValidationResults(path, result);

      showToast(
        `Validation failed: ${errorCount} errors, ${warningCount} warnings. Click for details.`,
        'error'
      );
    }
  }
}

/**
 * Show validation results dialog
 */
function showValidationResults(pipelinePath, results) {
  const pipelineName = pipelinePath.split(/[/\\]/).pop();
  const errors = results.errors || [];
  const warnings = results.warnings || [];

  const dialog = document.createElement('div');
  dialog.className = 'dialog validation-results-dialog';
  dialog.innerHTML = `
    <div class="dialog-overlay"></div>
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>Validation Results: ${pipelineName}</h2>
        <button class="btn-icon" id="validation-close-btn">
          <span data-icon="X" data-icon-size="18"></span>
        </button>
      </div>
      <div class="dialog-body">
        ${errors.length > 0 ? `
          <div class="validation-section">
            <h3 class="validation-section-title error">
              <span data-icon="XCircle" data-icon-size="18"></span>
              Errors (${errors.length})
            </h3>
            <div class="validation-messages">
              ${errors.map(err => `
                <div class="validation-message error">
                  <div class="validation-message-header">
                    <strong>${err.job || 'General'}</strong>
                    ${err.type ? `<span class="badge">${err.type}</span>` : ''}
                  </div>
                  <div class="validation-message-body">${err.message || err}</div>
                  ${err.details ? `<div class="validation-message-details">${err.details}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${warnings.length > 0 ? `
          <div class="validation-section">
            <h3 class="validation-section-title warning">
              <span data-icon="AlertTriangle" data-icon-size="18"></span>
              Warnings (${warnings.length})
            </h3>
            <div class="validation-messages">
              ${warnings.map(warn => `
                <div class="validation-message warning">
                  <div class="validation-message-header">
                    <strong>${warn.job || 'General'}</strong>
                    ${warn.type ? `<span class="badge">${warn.type}</span>` : ''}
                  </div>
                  <div class="validation-message-body">${warn.message || warn}</div>
                  ${warn.details ? `<div class="validation-message-details">${warn.details}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="dialog-footer">
        <button class="btn-primary" id="validation-ok-btn">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  initializeIcons(dialog);

  const closeDialog = () => {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 300);
  };

  dialog.querySelector('#validation-close-btn').addEventListener('click', closeDialog);
  dialog.querySelector('#validation-ok-btn').addEventListener('click', closeDialog);

  setTimeout(() => dialog.classList.add('active'), 10);
}

/**
 * Dry run pipeline (validation + execution plan)
 */
async function dryRunPipeline(path) {
  const result = await withErrorHandling(
    async () => await window.electronAPI.pipeline.dryRun(path),
    'Dry Run Pipeline',
    { showLoading: true, loadingMessage: 'Running dry-run...' }
  );

  if (result) {
    if (result.valid) {
      showDryRunResults(path, result);
    } else {
      showValidationResults(path, result);
      showToast('Pipeline has validation errors', 'error');
    }
  }
}

/**
 * Show dry-run results dialog
 */
function showDryRunResults(pipelinePath, results) {
  const pipelineName = pipelinePath.split(/[/\\]/).pop();
  const jobs = results.jobs || [];
  const stages = results.stages || [];

  const dialog = document.createElement('div');
  dialog.className = 'dialog dry-run-results-dialog';
  dialog.innerHTML = `
    <div class="dialog-overlay"></div>
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>Dry Run: ${pipelineName}</h2>
        <button class="btn-icon" id="dry-run-close-btn">
          <span data-icon="X" data-icon-size="18"></span>
        </button>
      </div>
      <div class="dialog-body">
        <div class="dry-run-summary">
          <p><strong>Total Jobs:</strong> ${jobs.length}</p>
          <p><strong>Stages:</strong> ${stages.join(' → ')}</p>
        </div>

        <h3>Execution Plan</h3>
        <div class="execution-plan">
          ${stages.map(stage => {
            const stageJobs = jobs.filter(j => j.stage === stage);
            return `
              <div class="stage-group">
                <h4 class="stage-title">
                  <span data-icon="Layers" data-icon-size="16"></span>
                  ${stage} (${stageJobs.length} jobs)
                </h4>
                <div class="stage-jobs">
                  ${stageJobs.map(job => `
                    <div class="job-item">
                      <div class="job-item-header">
                        <span data-icon="Box" data-icon-size="14"></span>
                        <strong>${job.name}</strong>
                        <span class="badge">${job.runner || 'unknown'}</span>
                      </div>
                      ${job.depends_on && job.depends_on.length > 0 ? `
                        <div class="job-item-deps">
                          Depends on: ${job.depends_on.join(', ')}
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${results.warnings && results.warnings.length > 0 ? `
          <div class="dry-run-warnings">
            <h4>
              <span data-icon="AlertTriangle" data-icon-size="16"></span>
              Warnings (${results.warnings.length})
            </h4>
            <ul>
              ${results.warnings.map(w => `<li>${w.message || w}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
      <div class="dialog-footer">
        <button class="btn-secondary" id="dry-run-cancel-btn">Cancel</button>
        <button class="btn-primary" id="dry-run-execute-btn">
          <span data-icon="Play" data-icon-size="16"></span>
          Execute Pipeline
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  initializeIcons(dialog);

  const closeDialog = () => {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 300);
  };

  dialog.querySelector('#dry-run-close-btn').addEventListener('click', closeDialog);
  dialog.querySelector('#dry-run-cancel-btn').addEventListener('click', closeDialog);
  dialog.querySelector('#dry-run-execute-btn').addEventListener('click', async () => {
    closeDialog();
    await executePipeline(pipelinePath);
  });

  setTimeout(() => dialog.classList.add('active'), 10);
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
 * Duplicate pipeline
 */
async function duplicatePipeline(path) {
  const result = await withErrorHandling(
    async () => await window.electronAPI.pipeline.read(path),
    'Load Pipeline'
  );

  if (!result || !result.success) return;

  const response = await window.electronAPI.getSettings();
  const settings = extractData(response, 'settings');
  let directory = settings.pipelineConfigPath || settings.etlBackendPath;

  if (!directory) {
    showToast('Pipeline directory not configured. Please set it in Settings.', 'error');
    return;
  }

  // If directory is the backend path, append 'schema' subdirectory
  if (directory === settings.etlBackendPath) {
    directory = `${directory}/schema`;
  }

  // Parse the YAML to update the name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const originalName = path.split(/[/\\]/).pop().replace('.yaml', '');
  const newPath = `${directory}/${originalName}_copy_${timestamp}.yaml`;

  // Update pipeline name in content
  let content = result.content;
  try {
    const yamlLines = content.split('\n');
    const nameLineIndex = yamlLines.findIndex(line => line.trim().startsWith('name:'));
    if (nameLineIndex !== -1) {
      const nameMatch = yamlLines[nameLineIndex].match(/name:\s*["']?([^"'\n]+)["']?/);
      if (nameMatch) {
        const originalPipelineName = nameMatch[1];
        yamlLines[nameLineIndex] = yamlLines[nameLineIndex].replace(
          originalPipelineName,
          `${originalPipelineName} (Copy)`
        );
        content = yamlLines.join('\n');
      }
    }
  } catch (e) {
    console.warn('Could not update pipeline name in duplicate:', e);
  }

  const writeResult = await withErrorHandling(
    async () => await window.electronAPI.pipeline.write(newPath, content),
    'Duplicate Pipeline'
  );

  if (writeResult && writeResult.success) {
    showToast('Pipeline duplicated successfully', 'success');
    await loadPipelines();
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
