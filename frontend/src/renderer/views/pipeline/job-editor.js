/**
 * Job Editor Dialog
 * Form for creating/editing individual jobs
 */

import { getRunnerConfig, getRunnersByType, PROCESSORS } from './runner-configs.js';
import { updateJob, getAllJobs } from './editor.js';
import { initializeIcons } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';

let currentJobName = null;
let currentJobConfig = null;

/**
 * Open job editor
 */
export function openJobEditor(jobName, jobConfig = null) {
  currentJobName = jobName;
  currentJobConfig = jobConfig || {
    stage: 'extract',
    runner: 'csv_reader',
    depends_on: [],
    input: {},
    output: {},
    processors: []
  };

  showJobEditorDialog();
  renderJobEditorContent();
}

/**
 * Show job editor dialog
 */
function showJobEditorDialog() {
  const existingDialog = document.getElementById('job-editor-dialog');
  if (existingDialog) existingDialog.remove();

  const dialog = document.createElement('div');
  dialog.id = 'job-editor-dialog';
  dialog.className = 'dialog job-editor-dialog';
  dialog.innerHTML = `
    <div class="dialog-overlay"></div>
    <div class="dialog-content job-editor-content">
      <div class="job-editor-header">
        <h2>${currentJobName ? 'Edit Job' : 'New Job'}</h2>
        <div class="job-editor-actions">
          <button class="btn-primary" id="job-save-btn">
            <span data-icon="Save" data-icon-size="16"></span>
            Save Job
          </button>
          <button class="btn-icon" id="job-close-btn">
            <span data-icon="X" data-icon-size="18"></span>
          </button>
        </div>
      </div>
      <div class="job-editor-body" id="job-editor-body">
        <!-- Content rendered here -->
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  initializeIcons(dialog);

  document.getElementById('job-close-btn').addEventListener('click', closeJobEditor);
  document.getElementById('job-save-btn').addEventListener('click', saveJob);

  setTimeout(() => dialog.classList.add('active'), 10);
}

/**
 * Render job editor content
 */
function renderJobEditorContent() {
  const container = document.getElementById('job-editor-body');
  if (!container) return;

  const runners = getRunnersByType();

  container.innerHTML = `
    <div class="form-group">
      <label>Job Name *</label>
      <input type="text" id="job-name" class="form-input" value="${currentJobName || ''}" placeholder="my_job">
    </div>

    <div class="form-group">
      <label>Stage *</label>
      <select id="job-stage" class="form-input">
        <option value="extract" ${currentJobConfig.stage === 'extract' ? 'selected' : ''}>Extract</option>
        <option value="stage" ${currentJobConfig.stage === 'stage' ? 'selected' : ''}>Stage</option>
        <option value="transform" ${currentJobConfig.stage === 'transform' ? 'selected' : ''}>Transform</option>
        <option value="export" ${currentJobConfig.stage === 'export' ? 'selected' : ''}>Export</option>
      </select>
    </div>

    <div class="form-group">
      <label>Runner *</label>
      <select id="job-runner" class="form-input">
        <optgroup label="Readers">
          ${runners.readers.map(r => `<option value="${r.key}" ${currentJobConfig.runner === r.key ? 'selected' : ''}>${r.displayName}</option>`).join('')}
        </optgroup>
        <optgroup label="Stagers">
          ${runners.stagers.map(r => `<option value="${r.key}" ${currentJobConfig.runner === r.key ? 'selected' : ''}>${r.displayName}</option>`).join('')}
        </optgroup>
        <optgroup label="Transformers">
          ${runners.transformers.map(r => `<option value="${r.key}" ${currentJobConfig.runner === r.key ? 'selected' : ''}>${r.displayName}</option>`).join('')}
        </optgroup>
        <optgroup label="Writers">
          ${runners.writers.map(r => `<option value="${r.key}" ${currentJobConfig.runner === r.key ? 'selected' : ''}>${r.displayName}</option>`).join('')}
        </optgroup>
      </select>
    </div>

    <div class="form-group">
      <label>Dependencies</label>
      <div id="dependencies-container">
        ${renderDependencies()}
      </div>
    </div>

    <div class="divider"></div>

    <div id="runner-specific-fields">
      ${renderRunnerFields()}
    </div>
  `;

  initializeIcons(container);

  // Event listeners
  document.getElementById('job-runner').addEventListener('change', () => {
    const newRunner = document.getElementById('job-runner').value;
    currentJobConfig.runner = newRunner;
    document.getElementById('runner-specific-fields').innerHTML = renderRunnerFields();
    initializeIcons(document.getElementById('runner-specific-fields'));
  });
}

/**
 * Render dependencies section
 */
function renderDependencies() {
  const allJobs = getAllJobs();
  const jobNames = Object.keys(allJobs).filter(name => name !== currentJobName);

  if (jobNames.length === 0) {
    return '<p class="text-muted">No other jobs available for dependencies</p>';
  }

  const currentDeps = currentJobConfig.depends_on || [];

  return jobNames.map(jobName => `
    <label class="checkbox-label">
      <input type="checkbox" class="job-dependency" value="${jobName}" ${currentDeps.includes(jobName) ? 'checked' : ''}>
      ${jobName}
    </label>
  `).join('');
}

/**
 * Render runner-specific fields
 */
function renderRunnerFields() {
  const runnerConfig = getRunnerConfig(currentJobConfig.runner);
  if (!runnerConfig) return '<p class="text-muted">Select a runner to configure</p>';

  let html = `<h4>${runnerConfig.displayName}</h4>`;

  // Schema field (for stagers)
  if (runnerConfig.schema) {
    const schemaValue = currentJobConfig.schema || '';
    html += `
      <div class="form-group">
        <label>${runnerConfig.schema.label} ${runnerConfig.schema.required ? '*' : ''}</label>
        <input type="text" id="job-schema" class="form-input" value="${schemaValue}" placeholder="staging">
      </div>
    `;
  }

  // Input fields
  if (runnerConfig.input) {
    html += '<h5>Input Configuration</h5>';
    Object.entries(runnerConfig.input).forEach(([key, config]) => {
      html += renderField('input', key, config, currentJobConfig.input?.[key]);
    });
  }

  // Output fields
  if (runnerConfig.output) {
    html += '<h5>Output Configuration</h5>';
    Object.entries(runnerConfig.output).forEach(([key, config]) => {
      html += renderField('output', key, config, currentJobConfig.output?.[key]);
    });
  }

  // Options fields (for DBT, advanced transformers)
  if (runnerConfig.options) {
    html += '<h5>Options</h5>';
    Object.entries(runnerConfig.options).forEach(([key, config]) => {
      html += renderField('options', key, config, currentJobConfig.options?.[key]);
    });
  }

  // Processors
  if (runnerConfig.processors) {
    html += '<h5>Processors</h5>';
    html += renderProcessors();
  }

  return html;
}

/**
 * Render a single form field
 */
function renderField(section, key, config, value = '') {
  const id = `job-${section}-${key}`;
  const required = config.required ? '*' : '';
  const val = value !== undefined ? value : (config.default || '');

  switch (config.type) {
    case 'string':
    case 'file':
      return `
        <div class="form-group">
          <label>${config.label || key} ${required}</label>
          <input type="text" id="${id}" class="form-input" value="${val}" placeholder="${config.placeholder || ''}">
        </div>
      `;

    case 'number':
      return `
        <div class="form-group">
          <label>${config.label || key} ${required}</label>
          <input type="number" id="${id}" class="form-input" value="${val}">
        </div>
      `;

    case 'boolean':
      return `
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="${id}" ${val ? 'checked' : ''}>
            ${config.label || key}
          </label>
        </div>
      `;

    case 'text':
      return `
        <div class="form-group">
          <label>${config.label || key} ${required}</label>
          <textarea id="${id}" class="form-input" rows="4">${val}</textarea>
        </div>
      `;

    case 'array':
      return `
        <div class="form-group">
          <label>${config.label || key} ${required}</label>
          <input type="text" id="${id}" class="form-input" value="${Array.isArray(val) ? val.join(', ') : val}" placeholder="item1, item2, item3">
          <small class="text-muted">Comma-separated values</small>
        </div>
      `;

    case 'object':
      return `
        <div class="form-group">
          <label>${config.label || key} ${required}</label>
          <textarea id="${id}" class="form-input monospace" rows="3">${typeof val === 'object' ? JSON.stringify(val, null, 2) : val}</textarea>
          <small class="text-muted">JSON format</small>
        </div>
      `;

    default:
      return `
        <div class="form-group">
          <label>${config.label || key} ${required}</label>
          <input type="text" id="${id}" class="form-input" value="${val}">
        </div>
      `;
  }
}

/**
 * Render processors section
 */
function renderProcessors() {
  const currentProcessors = currentJobConfig.processors || [];

  const availableProcessors = Object.entries(PROCESSORS).map(([key, proc]) => {
    const isActive = currentProcessors.some(p =>
      typeof p === 'string' ? p === key : p.name === key
    );

    return `
      <label class="checkbox-label">
        <input type="checkbox" class="processor-checkbox" value="${key}" ${isActive ? 'checked' : ''}>
        ${proc.displayName}
        <small class="text-muted">${proc.description}</small>
      </label>
    `;
  }).join('');

  return `
    <div class="processors-list">
      ${availableProcessors}
    </div>
  `;
}

/**
 * Save job
 */
function saveJob() {
  try {
    // Get job name
    const jobName = document.getElementById('job-name')?.value.trim();
    if (!jobName) {
      showToast('Job name is required', 'error');
      return;
    }

    // Build job config
    const job = {
      stage: document.getElementById('job-stage')?.value || 'extract',
      runner: document.getElementById('job-runner')?.value,
      depends_on: Array.from(document.querySelectorAll('.job-dependency:checked')).map(cb => cb.value),
      input: {},
      output: {},
      options: {},
      processors: []
    };

    // Get schema if exists
    const schema = document.getElementById('job-schema')?.value;
    if (schema) {
      job.schema = schema;
    }

    // Get runner-specific fields
    const runnerConfig = getRunnerConfig(job.runner);
    if (runnerConfig) {
      // Input fields
      if (runnerConfig.input) {
        Object.keys(runnerConfig.input).forEach(key => {
          const field = document.getElementById(`job-input-${key}`);
          if (field) {
            let value = field.type === 'checkbox' ? field.checked : field.value;

            // Parse arrays
            if (runnerConfig.input[key].type === 'array' && typeof value === 'string') {
              value = value.split(',').map(v => v.trim()).filter(Boolean);
            }

            // Parse objects
            if (runnerConfig.input[key].type === 'object' && typeof value === 'string') {
              try {
                value = JSON.parse(value);
              } catch (e) {
                // Keep as string if invalid JSON
              }
            }

            if (value !== '' && value !== undefined) {
              job.input[key] = value;
            }
          }
        });
      }

      // Output fields
      if (runnerConfig.output) {
        Object.keys(runnerConfig.output).forEach(key => {
          const field = document.getElementById(`job-output-${key}`);
          if (field) {
            const value = field.type === 'checkbox' ? field.checked : field.value;
            if (value !== '' && value !== undefined) {
              job.output[key] = value;
            }
          }
        });
      }

      // Options fields (for DBT, advanced transformers)
      if (runnerConfig.options) {
        Object.keys(runnerConfig.options).forEach(key => {
          const field = document.getElementById(`job-options-${key}`);
          if (field) {
            let value = field.type === 'checkbox' ? field.checked : field.value;

            // Parse arrays
            if (runnerConfig.options[key].type === 'array' && typeof value === 'string') {
              value = value.split(',').map(v => v.trim()).filter(Boolean);
            }

            // Parse objects
            if (runnerConfig.options[key].type === 'object' && typeof value === 'string') {
              try {
                value = JSON.parse(value);
              } catch (e) {
                // Keep as string if invalid JSON
              }
            }

            if (value !== '' && value !== undefined) {
              job.options[key] = value;
            }
          }
        });
      }

      // Processors
      if (runnerConfig.processors) {
        const selectedProcessors = Array.from(document.querySelectorAll('.processor-checkbox:checked'))
          .map(cb => cb.value);
        job.processors = selectedProcessors;
      }
    }

    // Clean up empty objects
    if (Object.keys(job.input).length === 0) delete job.input;
    if (Object.keys(job.output).length === 0) delete job.output;
    if (Object.keys(job.options).length === 0) delete job.options;
    if (job.processors.length === 0) delete job.processors;

    // Update in parent editor
    updateJob(jobName, job);

    showToast('Job saved', 'success');
    closeJobEditor();
  } catch (error) {
    showToast('Failed to save job: ' + error.message, 'error');
    console.error(error);
  }
}

/**
 * Close job editor
 */
function closeJobEditor() {
  const dialog = document.getElementById('job-editor-dialog');
  dialog?.classList.remove('active');
  setTimeout(() => dialog?.remove(), 300);
}
