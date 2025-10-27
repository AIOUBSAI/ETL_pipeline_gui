/**
 * Logging Utilities
 * Shared logging functions for IPC handlers
 */

/**
 * Map Python logging levels to app log types
 * @param {string} pythonLevel - Python log level (DEBUG, INFO, WARNING, ERROR, CRITICAL, SUCCESS)
 * @returns {string} App log type (info, warning, error, success)
 */
function mapPythonLogLevel(pythonLevel) {
  const level = pythonLevel.toUpperCase();

  switch (level) {
    case 'DEBUG':
      return 'info';
    case 'INFO':
      return 'info';
    case 'WARNING':
    case 'WARN':
      return 'warning';
    case 'ERROR':
      return 'error';
    case 'CRITICAL':
    case 'FATAL':
      return 'error';
    case 'SUCCESS':
      return 'success';
    default:
      return 'info';
  }
}

module.exports = {
  mapPythonLogLevel
};
