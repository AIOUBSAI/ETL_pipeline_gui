/**
 * Error Handler Utility
 * Provides consistent error handling and user-friendly messages
 */

import { showToast } from '../components/toast.js';

/**
 * Handle errors with user-friendly messages
 * @param {Error|Object} error - Error object or error response
 * @param {string} context - Context where error occurred
 * @returns {string} User-friendly error message
 */
export function handleError(error, context = 'Operation') {
  console.error(`Error in ${context}:`, error);

  let message = error.message || error.error || 'An unexpected error occurred';

  // User-friendly messages for common errors
  if (error.code === 'ENOENT' || message.includes('not found')) {
    message = 'File or directory not found. Please check the path.';
  } else if (error.code === 'EACCES' || message.includes('permission')) {
    message = 'Permission denied. Check file permissions.';
  } else if (message.includes('YAML') || message.includes('yaml')) {
    message = 'Invalid YAML syntax. Please check your configuration.';
  } else if (message.includes('Python') || message.includes('python')) {
    message = 'Python execution error. Check your Python installation.';
  } else if (message.includes('Database') || message.includes('database')) {
    message = 'Database error. Check the database path and permissions.';
  } else if (message.includes('SQL') || message.includes('sql')) {
    message = 'SQL error. Check your query syntax.';
  } else if (message.includes('not configured')) {
    message = `${message} Please configure it in Settings.`;
  }

  showToast(message, 'error');

  return message;
}

/**
 * Execute async operation with loading state and error handling
 * @param {Function} operation - Async operation to execute
 * @param {string} context - Context for error messages
 * @param {Object} options - Options
 * @returns {Promise} Operation result or null on error
 */
export async function withErrorHandling(operation, context, options = {}) {
  const { showLoading = false, loadingMessage = 'Loading...' } = options;

  try {
    if (showLoading) {
      showLoadingOverlay(loadingMessage);
    }

    const result = await operation();

    if (showLoading) {
      hideLoadingOverlay();
    }

    // Check if result has error property
    if (result && result.success === false) {
      throw new Error(result.error || 'Operation failed');
    }

    return result;
  } catch (error) {
    if (showLoading) {
      hideLoadingOverlay();
    }

    handleError(error, context);
    return null;
  }
}

/**
 * Show loading overlay
 * @param {string} message - Loading message
 */
function showLoadingOverlay(message) {
  let overlay = document.getElementById('loading-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p class="loading-message">${message}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('.loading-message').textContent = message;
    overlay.classList.add('active');
  }
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * Validate response from IPC handler
 * @param {Object} response - Response from IPC
 * @param {string} context - Context for error message
 * @returns {boolean} True if valid
 */
export function validateResponse(response, context) {
  if (!response) {
    handleError({ message: 'No response received' }, context);
    return false;
  }

  if (response.success === false) {
    handleError({ message: response.error || 'Operation failed' }, context);
    return false;
  }

  return true;
}

/**
 * Safe JSON parse with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value if parse fails
 * @returns {*} Parsed object or default value
 */
export function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('JSON parse error:', error);
    return defaultValue;
  }
}

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async operation to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise} Operation result
 */
export async function retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
