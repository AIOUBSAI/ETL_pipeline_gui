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
      console.log(`✓ ${component.name} initialized (${result.duration}ms)`);
    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.error = error;

      if (component.critical) {
        console.error(`✗ Critical: ${component.name} failed`, error);
      } else {
        console.warn(`⚠ ${component.name} failed, continuing anyway`, error);
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
    console.log('\n=== Initialization Summary ===');
    console.log(`Total components: ${summary.total}`);
    console.log(`Successful: ${summary.successful}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Total time: ${summary.totalDuration}ms`);

    if (summary.failed > 0) {
      console.log('\nFailed components:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error?.message || 'Unknown error'}`);
        });
    }

    console.log('==============================\n');
  }

  /**
   * Display fatal error UI
   * @param {string} componentName - Name of failed component
   * @param {Error} error - Error that occurred
   */
  showFatalError(componentName, error) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'fatal-error-container';
    errorContainer.innerHTML = `
      <div class="fatal-error-content">
        <div class="error-icon">⚠️</div>
        <h2>Critical Error</h2>
        <p><strong>${componentName}</strong> failed to initialize</p>
        <p class="error-message">${error?.message || 'Unknown error'}</p>
        <button class="btn-primary" onclick="location.reload()">Reload Application</button>
        <details style="margin-top: 20px;">
          <summary>Technical Details</summary>
          <pre style="text-align: left; overflow: auto; max-height: 200px;">${error?.stack || 'No stack trace available'}</pre>
        </details>
      </div>
    `;

    // Add styles inline to ensure they work even if CSS failed to load
    const style = document.createElement('style');
    style.textContent = `
      .fatal-error-container {
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
      .fatal-error-content {
        text-align: center;
        max-width: 600px;
        padding: 40px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 12px;
      }
      .error-icon {
        font-size: 64px;
        margin-bottom: 20px;
      }
      .fatal-error-content h2 {
        margin: 0 0 10px 0;
        font-size: 24px;
      }
      .fatal-error-content p {
        margin: 10px 0;
      }
      .error-message {
        color: #ff6b6b;
        font-family: 'Courier New', monospace;
        background: rgba(255, 107, 107, 0.1);
        padding: 10px;
        border-radius: 4px;
      }
      .fatal-error-content .btn-primary {
        margin-top: 20px;
        padding: 12px 24px;
        font-size: 16px;
        background: #4a9eff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      .fatal-error-content .btn-primary:hover {
        background: #357abd;
      }
      .fatal-error-content details {
        text-align: left;
      }
      .fatal-error-content summary {
        cursor: pointer;
        color: #4a9eff;
      }
      .fatal-error-content pre {
        background: rgba(0, 0, 0, 0.3);
        padding: 10px;
        border-radius: 4px;
        font-size: 12px;
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
    errorElement.className = 'component-error';
    errorElement.innerHTML = `
      <div class="component-error-icon">⚠️</div>
      <h3>${componentName} failed to load</h3>
      <p>${error?.message || 'Unknown error'}</p>
      <button class="btn-secondary" onclick="location.reload()">Reload App</button>
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
