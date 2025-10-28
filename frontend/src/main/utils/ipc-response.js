/**
 * IPC Response Utilities
 * Provides standardized response formats for all IPC handlers
 */

/**
 * Create a successful IPC response
 * @param {Object} data - Response data to merge into the response
 * @returns {Object} Standardized success response with success: true and spread data
 *
 * @example
 * return successResponse({ content: 'file content', path: '/path/to/file' });
 * // Returns: { success: true, content: 'file content', path: '/path/to/file' }
 */
function successResponse(data = {}) {
  return {
    success: true,
    ...data
  };
}

/**
 * Create an error IPC response
 * @param {Error|string} error - Error object or error message
 * @param {Object} defaults - Default values for expected data fields (e.g., { content: '', files: [] })
 * @returns {Object} Standardized error response with success: false, error message, and defaults
 *
 * @example
 * return errorResponse(error, { content: '', path: null });
 * // Returns: { success: false, error: 'File not found', content: '', path: null }
 */
function errorResponse(error, defaults = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    success: false,
    error: errorMessage,
    ...defaults
  };
}

/**
 * Wrap an IPC handler function with standardized error handling
 * @param {Function} handler - Async handler function
 * @param {Object} errorDefaults - Default values to return on error
 * @returns {Function} Wrapped handler with try-catch
 *
 * @example
 * ipcMain.handle('file:read', withErrorHandling(
 *   async (event, filePath) => {
 *     const content = await fs.readFile(filePath, 'utf-8');
 *     return successResponse({ content, path: filePath });
 *   },
 *   { content: '', path: null }
 * ));
 */
function withErrorHandling(handler, errorDefaults = {}) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('IPC handler error:', error);
      return errorResponse(error, errorDefaults);
    }
  };
}

module.exports = {
  successResponse,
  errorResponse,
  withErrorHandling
};
