/**
 * Process Output Parser
 * Parses Python process stdout/stderr output with JSON log support
 */

const { mapPythonLogLevel } = require('./logging');

/**
 * Process output parser for Python scripts
 */
class ProcessOutputParser {
  /**
   * Parse stdout data from Python process
   * @param {Buffer|string} data - Data from stdout
   * @param {Function} callback - Callback(logEntry) for each parsed log
   * @param {string} defaultType - Default log type if not JSON (default: 'info')
   */
  static parseStdout(data, callback, defaultType = 'info') {
    const message = data.toString();
    const lines = message.split('\n').filter(line => line.trim());

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const logEntry = this._parseLogLine(trimmedLine, defaultType);
      if (logEntry && callback) {
        callback(logEntry);
      }
    });
  }

  /**
   * Parse stderr data from Python process
   * @param {Buffer|string} data - Data from stderr
   * @param {Function} callback - Callback(logEntry) for each parsed log
   * @param {string} defaultType - Default log type if not JSON (default: 'error')
   */
  static parseStderr(data, callback, defaultType = 'error') {
    const message = data.toString();
    const lines = message.split('\n').filter(line => line.trim());

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const logEntry = this._parseLogLine(trimmedLine, defaultType);
      if (logEntry && callback) {
        callback(logEntry);
      }
    });
  }

  /**
   * Parse a single log line (tries JSON first, falls back to plain text)
   * @param {string} line - Log line to parse
   * @param {string} defaultType - Default log type if not JSON
   * @returns {Object|null} Log entry object or null
   * @private
   */
  static _parseLogLine(line, defaultType = 'info') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(line);

      // Validate it's a log object with required fields
      if (parsed.level && parsed.message) {
        return {
          type: mapPythonLogLevel(parsed.level),
          message: parsed.message,
          timestamp: parsed.timestamp || new Date().toISOString(),
          // Include any additional metadata
          ...( parsed.metadata && { metadata: parsed.metadata })
        };
      }
    } catch (e) {
      // Not JSON or invalid JSON, fall through to plain text
    }

    // Treat as plain text log
    return {
      type: defaultType,
      message: line,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create a simple log entry
   * @param {string} message - Log message
   * @param {string} type - Log type (info, warning, error, success)
   * @returns {Object} Log entry
   */
  static createLogEntry(message, type = 'info') {
    return {
      type,
      message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  ProcessOutputParser
};
