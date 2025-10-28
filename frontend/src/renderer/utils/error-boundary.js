/**
 * Error Boundary System
 * Provides component-level error boundaries to prevent single component failures
 * from crashing the entire application.
 */

import { logError } from './error-handler.js';

/**
 * Wraps a component initialization function with an error boundary
 * @param {Function} initFn - Component initialization function
 * @param {string} componentName - Name of the component for logging
 * @param {Object} options - Configuration options
 * @param {Function} [options.onError] - Optional error callback
 * @param {string} [options.targetViewId] - Optional container ID for error UI
 * @param {boolean} [options.showErrorUI=true] - Whether to display error UI
 * @param {boolean} [options.critical=false] - Whether this is a critical component
 * @returns {Promise<boolean>} Success status
 */
export async function withErrorBoundary(initFn, componentName, options = {}) {
  const {
    onError = null,
    targetViewId = null,
    showErrorUI = true,
    critical = false
  } = options;

  try {
    await initFn();
    return true;
  } catch (error) {
    console.error(`${componentName} initialization failed:`, error);

    // Log to error handler
    logError(error, { component: componentName, critical });

    // Display user-friendly error if enabled
    if (showErrorUI) {
      if (critical) {
        displayCriticalError(componentName, error);
      } else {
        displayComponentError(componentName, error, targetViewId);
      }
    }

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(error);
      } catch (handlerError) {
        console.error(`Error handler for ${componentName} failed:`, handlerError);
      }
    }

    return false;
  }
}

/**
 * Display error UI for a failed component (non-critical)
 * @param {string} componentName - Name of the failed component
 * @param {Error} error - The error that occurred
 * @param {string|null} targetViewId - Optional container ID
 */
function displayComponentError(componentName, error, targetViewId = null) {
  const errorContainer = document.createElement('div');
  errorContainer.className = 'error-boundary-component';
  errorContainer.innerHTML = `
    <div class="error-boundary-icon">⚠️</div>
    <h3 class="error-boundary-title">${componentName} Failed to Load</h3>
    <p class="error-boundary-message">${escapeHtml(error.message)}</p>
    <div class="error-boundary-actions">
      <button class="error-boundary-btn" onclick="location.reload()">Reload Application</button>
      <button class="error-boundary-btn error-boundary-btn-secondary" onclick="this.parentElement.parentElement.remove()">Dismiss</button>
    </div>
  `;

  // Find target container
  let targetElement = null;
  if (targetViewId) {
    targetElement = document.getElementById(targetViewId);
  }

  // Fallback: try to find view container by component name
  if (!targetElement) {
    const viewName = componentName.toLowerCase().replace(/\s+/g, '-');
    targetElement = document.getElementById(`${viewName}-view`);
  }

  // Final fallback: append to main content area
  if (!targetElement) {
    targetElement = document.querySelector('.content') || document.body;
  }

  targetElement.appendChild(errorContainer);
}

/**
 * Display critical error overlay (blocks entire application)
 * @param {string} componentName - Name of the failed critical component
 * @param {Error} error - The error that occurred
 */
function displayCriticalError(componentName, error) {
  const overlay = document.createElement('div');
  overlay.className = 'error-boundary-critical-overlay';
  overlay.innerHTML = `
    <div class="error-boundary-critical-content">
      <div class="error-boundary-critical-icon">🚨</div>
      <h1 class="error-boundary-critical-title">Critical Error</h1>
      <h2 class="error-boundary-critical-subtitle">${componentName} Failed to Initialize</h2>
      <p class="error-boundary-critical-message">
        A critical component failed to load. The application cannot continue.
      </p>
      <div class="error-boundary-critical-details">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
      <div class="error-boundary-critical-actions">
        <button class="error-boundary-critical-btn" onclick="location.reload()">
          Reload Application
        </button>
      </div>
      <div class="error-boundary-critical-footer">
        If this problem persists, please check the application logs or contact support.
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

/**
 * Escape HTML to prevent XSS in error messages
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Create an error boundary wrapper for a component class/module
 * Useful for wrapping entire view modules
 * @param {Object} componentModule - Module with init function
 * @param {string} componentName - Name for logging
 * @param {Object} options - Error boundary options
 * @returns {Object} Wrapped module
 */
export function createErrorBoundary(componentModule, componentName, options = {}) {
  return {
    ...componentModule,
    init: async (...args) => {
      return withErrorBoundary(
        () => componentModule.init(...args),
        componentName,
        options
      );
    }
  };
}

/**
 * Batch wrap multiple components with error boundaries
 * @param {Array<{fn: Function, name: string, options?: Object}>} components
 * @returns {Promise<Array<{name: string, success: boolean}>>}
 */
export async function initializeWithBoundaries(components) {
  const results = [];

  for (const { fn, name, options = {} } of components) {
    const success = await withErrorBoundary(fn, name, options);
    results.push({ name, success });
  }

  return results;
}
