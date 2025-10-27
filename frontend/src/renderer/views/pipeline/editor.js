/**
 * Pipeline Editor
 * Form-based YAML pipeline editor
 */

import { showToast } from '../../components/toast.js';
import { handleError } from '../../utils/error-handler.js';
import { initializeIcons } from '../../utils/icons.js';
import { openJobEditor } from './job-editor.js';
import { parseYAML, stringifyYAML } from '../../utils/yaml-utils.js';

let currentPipelinePath = null;
let currentConfig = null;
let isDirty = false;

/**
 * Open pipeline editor
 */
export function openPipelineEditor(path, yamlContent) {
  console.log('openPipelineEditor called', { path, contentLength: yamlContent?.length });

  currentPipelinePath = path;
  isDirty = false;

  try {
    // Parse YAML
    console.log('Parsing YAML...');
    currentConfig = parseYAML(yamlContent);
    console.log('Parsed config:', currentConfig);

    console.log('Showing dialog...');
    showEditorDialog();
    console.log('Rendering content...');
    renderEditorContent();
    console.log('Editor opened successfully');
  } catch (error) {
    console.error('Error opening editor:', error);
    handleError(error, 'Parse Pipeline');
  }
}

/**
 * Show editor dialog
 */
function showEditorDialog() {
  console.log('showEditorDialog called');

  const existingDialog = document.getElementById('pipeline-editor-dialog');
  if (existingDialog) {
    console.log('Removing existing dialog');
    existingDialog.remove();
  }

  console.log('Creating dialog element');
  const wrapper = document.createElement('div');
  wrapper.id = 'pipeline-editor-dialog';
  wrapper.className = 'pipeline-editor-dialog';
  console.log('Setting dialog HTML');
  wrapper.innerHTML = `
    <div class="dialog-overlay">
      <div class="dialog pipeline-editor-content">
      <div class="pipeline-editor-header">
        <h2>Pipeline Editor</h2>
        <div class="pipeline-editor-actions">
          <button class="icon-btn" id="pipeline-validate-btn" title="Validate Pipeline">
            <span data-icon="CheckCircle" data-icon-size="18"></span>
          </button>
          <button class="icon-btn" id="pipeline-save-btn" title="Save Pipeline">
            <span data-icon="Save" data-icon-size="18"></span>
          </button>
          <button class="icon-btn" id="pipeline-close-btn" title="Close">
            <span data-icon="X" data-icon-size="18"></span>
          </button>
        </div>
      </div>
      <div class="pipeline-editor-body">
        <div class="pipeline-editor-sidebar">
          <nav class="pipeline-editor-nav">
            <button class="pipeline-nav-item active" data-section="metadata">
              <span data-icon="Info" data-icon-size="16"></span>
              Metadata
            </button>
            <button class="pipeline-nav-item" data-section="variables">
              <span data-icon="Variable" data-icon-size="16"></span>
              Variables
            </button>
            <button class="pipeline-nav-item" data-section="database">
              <span data-icon="Database" data-icon-size="16"></span>
              Database
            </button>
            <button class="pipeline-nav-item" data-section="stages">
              <span data-icon="Layers" data-icon-size="16"></span>
              Stages
            </button>
            <button class="pipeline-nav-item" data-section="jobs">
              <span data-icon="Boxes" data-icon-size="16"></span>
              Jobs <span class="badge" id="jobs-count">0</span>
            </button>
          </nav>
        </div>
        <div class="pipeline-editor-main" id="pipeline-editor-main">
          <!-- Content rendered here -->
        </div>
      </div>
      </div>
    </div>
  `;

  console.log('Appending wrapper to body');
  document.body.appendChild(wrapper);
  console.log('Wrapper appended, initializing icons');
  initializeIcons(wrapper);

  // Event listeners
  console.log('Adding event listeners');
  document.getElementById('pipeline-close-btn').addEventListener('click', closePipelineEditor);
  document.getElementById('pipeline-save-btn').addEventListener('click', savePipeline);
  document.getElementById('pipeline-validate-btn').addEventListener('click', validateCurrentPipeline);

  // Nav items
  wrapper.querySelectorAll('.pipeline-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      wrapper.querySelectorAll('.pipeline-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderSection(item.dataset.section);
    });
  });

  // Show dialog by adding active class to overlay
  console.log('Setting active class on overlay after delay');
  setTimeout(() => {
    const overlay = wrapper.querySelector('.dialog-overlay');
    if (overlay) {
      overlay.classList.add('active');
      console.log('Overlay active class added');
    } else {
      console.error('Could not find dialog-overlay!');
    }
  }, 10);
}

/**
 * Render editor content
 */
function renderEditorContent() {
  renderSection('metadata');
  updateJobsCount();
}

/**
 * Render a specific section
 */
function renderSection(section) {
  const container = document.getElementById('pipeline-editor-main');
  if (!container) return;

  switch (section) {
    case 'metadata':
      container.innerHTML = renderMetadataSection();
      break;
    case 'variables':
      container.innerHTML = renderVariablesSection();
      break;
    case 'database':
      container.innerHTML = renderDatabaseSection();
      break;
    case 'stages':
      container.innerHTML = renderStagesSection();
      break;
    case 'jobs':
      container.innerHTML = renderJobsSection();
      break;
  }

  initializeIcons(container);
  attachSectionListeners(section);
}

/**
 * Render metadata section
 */
function renderMetadataSection() {
  const pipeline = currentConfig.pipeline || {};

  return `
    <div class="editor-section">
      <h3>Pipeline Metadata</h3>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" id="pipeline-name" value="${pipeline.name || ''}" class="form-input">
      </div>
      <div class="form-group">
        <label>Version</label>
        <input type="text" id="pipeline-version" value="${pipeline.version || '1.0'}" class="form-input">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="pipeline-description" class="form-input" rows="3">${pipeline.description || ''}</textarea>
      </div>
    </div>
  `;
}

/**
 * Render variables section
 */
function renderVariablesSection() {
  const variables = currentConfig.variables || {};

  const rows = Object.entries(variables).map(([key, value]) => `
    <div class="variable-row">
      <input type="text" class="form-input variable-key" value="${key}" placeholder="Key">
      <input type="text" class="form-input variable-value" value="${value}" placeholder="Value">
      <button class="btn-icon variable-remove" data-key="${key}">
        <span data-icon="X" data-icon-size="14"></span>
      </button>
    </div>
  `).join('');

  return `
    <div class="editor-section">
      <h3>Variables</h3>
      <div id="variables-list">
        ${rows}
      </div>
      <button class="btn-secondary" id="add-variable-btn">
        <span data-icon="Plus" data-icon-size="16"></span>
        Add Variable
      </button>
    </div>
  `;
}

/**
 * Render database section
 */
function renderDatabaseSection() {
  const db = currentConfig.databases?.warehouse || {};
  const schemas = db.schemas || [];

  return `
    <div class="editor-section">
      <h3>Database Configuration</h3>
      <div class="form-group">
        <label>Type</label>
        <select id="db-type" class="form-input">
          <option value="duckdb" ${db.type === 'duckdb' ? 'selected' : ''}>DuckDB</option>
          <option value="sqlite" ${db.type === 'sqlite' ? 'selected' : ''}>SQLite</option>
        </select>
      </div>
      <div class="form-group">
        <label>Path</label>
        <input type="text" id="db-path" value="${db.path || 'out/db/warehouse.duckdb'}" class="form-input">
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="db-reset" ${db.reset_on_start ? 'checked' : ''}>
          Reset on start
        </label>
      </div>
      <div class="form-group">
        <label>Schemas (comma-separated)</label>
        <input type="text" id="db-schemas" value="${schemas.join(', ')}" class="form-input" placeholder="landing, staging, analytics">
      </div>
    </div>
  `;
}

/**
 * Render stages section
 */
function renderStagesSection() {
  const stages = currentConfig.stages || [];

  return `
    <div class="editor-section">
      <h3>Pipeline Stages</h3>
      <p class="text-muted">Stages define the execution order of jobs</p>
      <div class="form-group">
        <label>Stages (comma-separated)</label>
        <input type="text" id="stages-list" value="${stages.join(', ')}" class="form-input" placeholder="extract, stage, transform, export">
      </div>
      <p class="text-muted"><strong>Default:</strong> extract, stage, transform, export</p>
    </div>
  `;
}

/**
 * Render jobs section
 */
function renderJobsSection() {
  const jobs = currentConfig.jobs || {};
  const jobList = Object.entries(jobs).map(([name, job]) => {
    const dependsOn = job.depends_on || [];
    return `
      <div class="job-card" data-job-name="${name}">
        <div class="job-card-header">
          <div class="job-card-title">
            <span data-icon="Box" data-icon-size="16"></span>
            <strong>${name}</strong>
          </div>
          <div class="job-card-actions">
            <button class="btn-icon job-edit" data-job-name="${name}">
              <span data-icon="Edit" data-icon-size="14"></span>
            </button>
            <button class="btn-icon job-delete" data-job-name="${name}">
              <span data-icon="Trash2" data-icon-size="14"></span>
            </button>
          </div>
        </div>
        <div class="job-card-body">
          <div class="job-meta">
            <span class="badge">${job.stage || 'unknown'}</span>
            <span class="badge">${job.runner || 'unknown'}</span>
          </div>
          ${dependsOn.length > 0 ? `<div class="job-depends">Depends: ${dependsOn.join(', ')}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="editor-section">
      <div class="section-header">
        <h3>Jobs</h3>
        <button class="btn-primary" id="add-job-btn">
          <span data-icon="Plus" data-icon-size="16"></span>
          Add Job
        </button>
      </div>
      <div id="jobs-list">
        ${jobList || '<p class="text-muted">No jobs defined yet</p>'}
      </div>
    </div>
  `;
}

/**
 * Attach event listeners for each section
 */
function attachSectionListeners(section) {
  if (section === 'metadata') {
    ['pipeline-name', 'pipeline-version', 'pipeline-description'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', markDirty);
    });
  } else if (section === 'variables') {
    document.getElementById('add-variable-btn')?.addEventListener('click', addVariable);
    document.querySelectorAll('.variable-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.variable-row').remove();
        markDirty();
      });
    });
    document.querySelectorAll('.variable-key, .variable-value').forEach(input => {
      input.addEventListener('input', markDirty);
    });
  } else if (section === 'database') {
    ['db-type', 'db-path', 'db-reset', 'db-schemas'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', markDirty);
    });
  } else if (section === 'stages') {
    document.getElementById('stages-list')?.addEventListener('input', markDirty);
  } else if (section === 'jobs') {
    document.getElementById('add-job-btn')?.addEventListener('click', () => openJobEditor(null));
    document.querySelectorAll('.job-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobName = e.target.closest('[data-job-name]').dataset.jobName;
        openJobEditor(jobName, currentConfig.jobs[jobName]);
      });
    });
    document.querySelectorAll('.job-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobName = e.target.closest('[data-job-name]').dataset.jobName;
        if (confirm(`Delete job "${jobName}"?`)) {
          delete currentConfig.jobs[jobName];
          markDirty();
          renderSection('jobs');
          updateJobsCount();
        }
      });
    });
  }
}

/**
 * Add new variable
 */
function addVariable() {
  const list = document.getElementById('variables-list');
  const row = document.createElement('div');
  row.className = 'variable-row';
  row.innerHTML = `
    <input type="text" class="form-input variable-key" placeholder="Key">
    <input type="text" class="form-input variable-value" placeholder="Value">
    <button class="btn-icon variable-remove">
      <span data-icon="X" data-icon-size="14"></span>
    </button>
  `;
  list.appendChild(row);
  initializeIcons(row);

  row.querySelector('.variable-remove').addEventListener('click', () => {
    row.remove();
    markDirty();
  });
  row.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', markDirty);
  });
}

/**
 * Update jobs count badge
 */
function updateJobsCount() {
  const count = Object.keys(currentConfig.jobs || {}).length;
  const badge = document.getElementById('jobs-count');
  if (badge) {
    badge.textContent = count;
  }
}

/**
 * Mark as dirty
 */
function markDirty() {
  isDirty = true;
}

/**
 * Save pipeline
 */
async function savePipeline() {
  try {
    // Collect data from all sections
    collectMetadata();
    collectVariables();
    collectDatabase();
    collectStages();

    // Convert to YAML
    const yamlContent = stringifyYAML(currentConfig);

    // Save
    const result = await window.electronAPI.pipeline.write(currentPipelinePath, yamlContent);

    if (result.success) {
      isDirty = false;
      showToast('Pipeline saved successfully', 'success');
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    handleError(error, 'Save Pipeline');
  }
}

/**
 * Validate current pipeline
 */
async function validateCurrentPipeline() {
  try {
    const result = await window.electronAPI.pipeline.validate(currentPipelinePath);

    if (result.valid) {
      showToast('✓ Pipeline is valid', 'success');
    } else {
      showToast(`Validation failed: ${result.errors?.length || 0} errors`, 'error');
      console.error('Errors:', result.errors);
    }
  } catch (error) {
    handleError(error, 'Validate Pipeline');
  }
}

/**
 * Close editor
 */
function closePipelineEditor() {
  if (isDirty && !confirm('You have unsaved changes. Close anyway?')) {
    return;
  }

  const wrapper = document.getElementById('pipeline-editor-dialog');
  const overlay = wrapper?.querySelector('.dialog-overlay');
  overlay?.classList.remove('active');
  setTimeout(() => wrapper?.remove(), 300);
}

/**
 * Collect metadata from form
 */
function collectMetadata() {
  currentConfig.pipeline = {
    name: document.getElementById('pipeline-name')?.value || 'Untitled Pipeline',
    version: document.getElementById('pipeline-version')?.value || '1.0',
    description: document.getElementById('pipeline-description')?.value || ''
  };
}

/**
 * Collect variables from form
 */
function collectVariables() {
  const variables = {};
  document.querySelectorAll('.variable-row').forEach(row => {
    const key = row.querySelector('.variable-key')?.value;
    const value = row.querySelector('.variable-value')?.value;
    if (key) {
      variables[key] = value;
    }
  });
  currentConfig.variables = variables;
}

/**
 * Collect database config from form
 */
function collectDatabase() {
  const schemas = document.getElementById('db-schemas')?.value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean) || [];

  currentConfig.databases = {
    warehouse: {
      type: document.getElementById('db-type')?.value || 'duckdb',
      path: document.getElementById('db-path')?.value || 'out/db/warehouse.duckdb',
      reset_on_start: document.getElementById('db-reset')?.checked || false,
      schemas
    }
  };
}

/**
 * Collect stages from form
 */
function collectStages() {
  const stages = document.getElementById('stages-list')?.value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean) || ['extract', 'stage', 'transform', 'export'];

  currentConfig.stages = stages;
}

/**
 * Update job in config (called by job-editor)
 */
export function updateJob(jobName, jobConfig) {
  if (!currentConfig.jobs) {
    currentConfig.jobs = {};
  }

  currentConfig.jobs[jobName] = jobConfig;
  markDirty();
  renderSection('jobs');
  updateJobsCount();
}

/**
 * Get all jobs (for dependency selection)
 */
export function getAllJobs() {
  return currentConfig.jobs || {};
}

// YAML parsing now handled by yaml-utils.js
