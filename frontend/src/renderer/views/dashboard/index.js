/**
 * Dashboard View
 * Main dashboard functionality
 */

import { state, setState } from '../../core/state.js';
import { showToast } from '../../components/toast.js';
import { initializeControls, updateButtonStates, loadProjects } from './controls.js';
import { initializeLogs, addLog } from './logs.js';

/**
 * Initialize dashboard view (wrapped with error boundary)
 */
export function initializeDashboard() {
  try {
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
  } catch (error) {
    console.error('Dashboard initialization failed:', error);

    // Display error UI
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-boundary-component';
    errorContainer.innerHTML = `
      <div class="error-boundary-icon">⚠️</div>
      <h3 class="error-boundary-title">Dashboard Failed to Load</h3>
      <p class="error-boundary-message">${error.message}</p>
      <div class="error-boundary-actions">
        <button class="error-boundary-btn" onclick="location.reload()">Reload Application</button>
      </div>
    `;

    const targetElement = document.getElementById('dashboard-view');
    if (targetElement) {
      targetElement.appendChild(errorContainer);
    }

    // Custom recovery logic
    setState('dashboardAvailable', false);
  }
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
