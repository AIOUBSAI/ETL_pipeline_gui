/**
 * Dashboard Controls
 * Handles project selection and control buttons
 */

import { getById } from '../../utils/dom.js';
import { state, setState } from '../../core/state.js';
import { showToast } from '../../components/toast.js';

/**
 * Initialize dashboard controls
 * @param {Object} callbacks - Callback functions
 */
export function initializeControls(callbacks) {
  const selectFolderBtn = getById('select-folder-btn');
  const projectSelect = getById('project-select');
  const runBtn = getById('run-btn');
  const stopBtn = getById('stop-btn');
  const reloadBtn = getById('reload-btn');

  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', async () => {
      try {
        const folderPath = await window.electronAPI.selectRootFolder();

        if (folderPath) {
          // Update settings with new root folder
          const settings = await window.electronAPI.getSettings();
          settings.rootFolder = folderPath;
          await window.electronAPI.saveSettings(settings);

          // Update state and reload projects
          setState('settings', settings);
          await callbacks.onReload();

          showToast(`Root folder changed to: ${folderPath}`, 'success', 'Folder Changed');
        }
      } catch (error) {
        showToast('Failed to change root folder', 'error');
      }
    });
  }

  if (projectSelect) {
    projectSelect.addEventListener('change', (e) => {
      setState('selectedProjectPath', e.target.value);
      updateButtonStates();
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      if (state.selectedProjectPath && !state.isRunning) {
        await callbacks.onRun();
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      if (state.isRunning) {
        await callbacks.onStop();
      }
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      await callbacks.onReload();
      showToast('Projects reloaded from root folder', 'success', 'Reloaded');
    });
  }
}

/**
 * Update button states based on current state
 */
export function updateButtonStates() {
  const runBtn = getById('run-btn');
  const stopBtn = getById('stop-btn');

  if (state.selectedProjectPath && !state.isRunning) {
    if (runBtn) runBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  } else if (state.isRunning) {
    if (runBtn) runBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
  } else {
    if (runBtn) runBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
  }
}

/**
 * Render project select dropdown
 */
export function renderProjectSelect() {
  const projectSelect = getById('project-select');
  if (!projectSelect) return;

  projectSelect.innerHTML = '<option value="">Select a folder...</option>';

  state.projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.path;
    option.textContent = project.name;
    projectSelect.appendChild(option);
  });
}

/**
 * Load projects from root folder
 */
export async function loadProjects() {
  try {
    if (!state.settings.rootFolder) {
      return;
    }

    const folders = await window.electronAPI.scanProjects(state.settings.rootFolder);
    setState('projects', folders);
    renderProjectSelect();
  } catch (error) {
    // Silent fail
  }
}
