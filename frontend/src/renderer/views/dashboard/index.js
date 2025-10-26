/**
 * Dashboard View
 * Main dashboard functionality
 */

import { state, setState } from '../../core/state.js';
import { showToast } from '../../components/toast.js';
import { initializeControls, updateButtonStates, loadProjects } from './controls.js';
import { initializeLogs, addLog } from './logs.js';

/**
 * Initialize dashboard view
 */
export function initializeDashboard() {
  // Initialize controls with callbacks
  initializeControls({
    onRun: runProject,
    onStop: stopProject,
    onReload: loadProjects
  });

  // Initialize logs panel
  initializeLogs();

  // Set up log listener
  window.electronAPI.onLogMessage((log) => {
    addLog(log);
  });
}

/**
 * Run the selected project
 */
async function runProject() {
  try {
    if (!state.selectedProjectPath) {
      return;
    }

    setState('isRunning', true);
    updateButtonStates();

    const project = state.projects.find(p => p.path === state.selectedProjectPath);
    const projectName = project?.name || 'Project';

    addLog({
      type: 'info',
      message: `Starting ${projectName}...`,
      timestamp: new Date().toISOString()
    });

    // Run the project
    window.electronAPI.runPythonScript(projectName, state.selectedProjectPath)
      .then(result => {
        setState('isRunning', false);
        updateButtonStates();

        addLog({
          type: 'success',
          message: `${projectName} completed successfully`,
          timestamp: new Date().toISOString()
        });
      })
      .catch(error => {
        setState('isRunning', false);
        updateButtonStates();

        addLog({
          type: 'error',
          message: `Error running ${projectName}: ${error.error || error.message}`,
          timestamp: new Date().toISOString()
        });
      });

  } catch (error) {
    setState('isRunning', false);
    updateButtonStates();
    showToast(`Error starting project: ${error.message}`, 'error');
  }
}

/**
 * Stop the running project
 */
async function stopProject() {
  try {
    const project = state.projects.find(p => p.path === state.selectedProjectPath);
    const projectName = project?.name || 'Project';

    const result = await window.electronAPI.stopProject(projectName);

    if (result.success) {
      setState('isRunning', false);
      updateButtonStates();
      showToast(`Stopped ${projectName}`, 'info');

      addLog({
        type: 'info',
        message: `Stopped ${projectName}`,
        timestamp: new Date().toISOString()
      });
    } else {
      showToast(`Failed to stop project: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'error');
  }
}
