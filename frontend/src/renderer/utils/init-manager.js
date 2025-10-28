/**
 * Initialization Manager
 * Provides robust component initialization with error boundaries,
 * graceful degradation, and detailed logging.
 */

/**
 * Component initialization result
 * @typedef {Object} InitResult
 * @property {string} name - Component name
 * @property {boolean} success - Whether initialization succeeded
 * @property {number} duration - Initialization time in ms
 * @property {Error} [error] - Error if initialization failed
 */

/**
 * Component definition
 * @typedef {Object} ComponentDef
 * @property {string} name - Component display name
 * @property {Function} init - Initialization function (sync or async)
 * @property {boolean} critical - If true, app fails if component fails
 */

/**
 * Initialization Manager
 * Coordinates component initialization with error boundaries
 */
export class InitializationManager {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Initialize a single component with error boundary
   * @param {ComponentDef} component - Component definition
   * @returns {Promise<InitResult>} Initialization result
   */
  async initializeComponent(component) {
    const startTime = Date.now();
    const result = {
      name: component.name,
      success: false,
      duration: 0,
    };

    try {
      await component.init();
      result.success = true;
      result.duration = Date.now() - startTime;
      // Success logging removed - only log failures
    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.error = error;

      if (component.critical) {
        console.error(`Critical component failed: ${component.name}`, error);
      } else {
        console.warn(`Component failed (non-critical): ${component.name}`, error);
      }
    }

    this.results.push(result);
    return result;
  }

  /**
   * Initialize multiple components in sequence
   * @param {ComponentDef[]} components - Array of component definitions
   * @param {Object} options - Initialization options
   * @param {boolean} options.stopOnCriticalFailure - Stop if critical component fails (default: true)
   * @returns {Promise<boolean>} True if all critical components succeeded
   */
  async initializeComponents(components, options = {}) {
    const { stopOnCriticalFailure = true } = options;

    for (const component of components) {
      const result = await this.initializeComponent(component);

      // If critical component failed and we should stop, return early
      if (component.critical && !result.success && stopOnCriticalFailure) {
        this.showFatalError(component.name, result.error);
        return false;
      }
    }

    return true;
  }

  /**
   * Get initialization summary
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const totalDuration = Date.now() - this.startTime;
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const criticalFailures = this.results.filter(
      r => !r.success && r.error
    ).length;

    return {
      total: this.results.length,
      successful,
      failed,
      criticalFailures,
      totalDuration,
      results: this.results,
    };
  }

  /**
   * Log initialization summary
   */
  logSummary() {
    const summary = this.getSummary();

    // Only log if there were failures
    if (summary.failed > 0) {
      console.log('\n=== Initialization Summary ===');
      console.log(`Total components: ${summary.total}`);
      console.log(`Successful: ${summary.successful}`);
      console.log(`Failed: ${summary.failed}`);
      console.log(`Total time: ${summary.totalDuration}ms`);

      console.log('\nFailed components:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error?.message || 'Unknown error'}`);
        });

      console.log('==============================\n');
    }
  }

  /**
   * Display fatal error UI
   * @param {string} componentName - Name of failed component
   * @param {Error} error - Error that occurred
   */
  showFatalError(componentName, error) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-boundary-critical-overlay';
    errorContainer.innerHTML = `
      <div class="error-boundary-critical-content">
        <div class="error-boundary-critical-icon">🚨</div>
        <h1 class="error-boundary-critical-title">Critical Error</h1>
        <h2 class="error-boundary-critical-subtitle">${componentName} Failed to Initialize</h2>
        <p class="error-boundary-critical-message">A critical component failed to load. The application cannot continue.</p>
        <div class="error-boundary-critical-details">
          <strong>Error:</strong> ${error?.message || 'Unknown error'}
        </div>
        <div class="error-boundary-critical-actions">
          <button class="error-boundary-critical-btn" onclick="location.reload()">Reload Application</button>
        </div>
        <div class="error-boundary-critical-footer">
          If this problem persists, please check the application logs or contact support.
        </div>
      </div>
    `;

    // Add styles inline to ensure they work even if CSS failed to load
    const style = document.createElement('style');
    style.textContent = `
      .error-boundary-critical-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .error-boundary-critical-content {
        text-align: center;
        max-width: 600px;
        padding: 40px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 12px;
      }
      .error-boundary-critical-icon {
        font-size: 64px;
        margin-bottom: 20px;
      }
      .error-boundary-critical-title {
        margin: 0 0 10px 0;
        font-size: 32px;
        color: #f38ba8;
        font-weight: 700;
      }
      .error-boundary-critical-subtitle {
        margin: 0 0 10px 0;
        font-size: 20px;
        font-weight: 500;
      }
      .error-boundary-critical-message {
        margin: 10px 0;
        font-size: 14px;
      }
      .error-boundary-critical-details {
        color: #f38ba8;
        font-family: 'Courier New', monospace;
        background: rgba(243, 139, 168, 0.1);
        padding: 16px;
        border-radius: 8px;
        border-left: 4px solid #f38ba8;
        margin: 20px 0;
        text-align: left;
      }
      .error-boundary-critical-actions {
        margin: 20px 0;
      }
      .error-boundary-critical-btn {
        padding: 14px 32px;
        font-size: 16px;
        font-weight: 600;
        background: #f38ba8;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
      }
      .error-boundary-critical-btn:hover {
        filter: brightness(1.2);
      }
      .error-boundary-critical-footer {
        margin-top: 20px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(errorContainer);
  }

  /**
   * Display component error UI (for non-critical components)
   * @param {string} componentName - Name of failed component
   * @param {Error} error - Error that occurred
   * @param {string} targetViewId - ID of view to show error in (optional)
   */
  showComponentError(componentName, error, targetViewId = null) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-boundary-component';
    errorElement.innerHTML = `
      <div class="error-boundary-icon">⚠️</div>
      <h3 class="error-boundary-title">${componentName} Failed to Load</h3>
      <p class="error-boundary-message">${error?.message || 'Unknown error'}</p>
      <div class="error-boundary-actions">
        <button class="error-boundary-btn" onclick="location.reload()">Reload Application</button>
        <button class="error-boundary-btn error-boundary-btn-secondary" onclick="this.parentElement.parentElement.remove()">Dismiss</button>
      </div>
    `;

    // Try to find the target view
    const targetView = targetViewId
      ? document.getElementById(targetViewId)
      : document.querySelector('.view.active');

    if (targetView) {
      targetView.appendChild(errorElement);
    } else {
      // Fallback: append to body
      document.body.appendChild(errorElement);
    }
  }
}

/**
 * Create a component definition
 * @param {string} name - Component display name
 * @param {Function} initFn - Initialization function
 * @param {boolean} critical - Whether component is critical (default: false)
 * @returns {ComponentDef} Component definition
 */
export function defineComponent(name, initFn, critical = false) {
  return { name, init: initFn, critical };
}

/**
 * Create a component definition with custom error handler
 * @param {string} name - Component display name
 * @param {Function} initFn - Initialization function
 * @param {Object} options - Component options
 * @param {boolean} options.critical - Whether component is critical
 * @param {Function} options.onError - Custom error handler
 * @returns {ComponentDef} Component definition
 */
export function defineComponentWithErrorHandler(name, initFn, options = {}) {
  const { critical = false, onError } = options;

  return {
    name,
    critical,
    init: async () => {
      try {
        await initFn();
      } catch (error) {
        if (onError) {
          onError(error);
        }
        throw error; // Re-throw so InitializationManager can handle it
      }
    },
  };
}
