/**
 * Audit Logger
 * Logs authentication and security events to file for auditing
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Audit log file path
const AUDIT_LOG_PATH = path.join(app.getPath('userData'), 'auth-audit.log');

/**
 * Write an audit log entry
 * @param {string} event - Event type (LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, etc.)
 * @param {string} username - Username involved
 * @param {Object} details - Additional details
 */
function logAuthEvent(event, username, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    username,
    ...details
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  try {
    fs.appendFileSync(AUDIT_LOG_PATH, logLine, 'utf8');
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Get recent audit log entries
 * @param {number} limit - Maximum number of entries to return
 * @returns {Array<Object>} Recent audit entries
 */
function getRecentAuditLogs(limit = 100) {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) {
      return [];
    }

    const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    // Parse and return last N entries
    const entries = lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(entry => entry !== null);

    return entries.reverse(); // Most recent first
  } catch (error) {
    console.error('Failed to read audit log:', error);
    return [];
  }
}

/**
 * Clear audit log (for admin use)
 * @returns {boolean} Success status
 */
function clearAuditLog() {
  try {
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      fs.unlinkSync(AUDIT_LOG_PATH);
    }
    return true;
  } catch (error) {
    console.error('Failed to clear audit log:', error);
    return false;
  }
}

// Audit event types
const AuditEvents = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGIN_LOCKED: 'LOGIN_LOCKED',
  LOGOUT: 'LOGOUT',
  SESSION_TIMEOUT: 'SESSION_TIMEOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED'
};

module.exports = {
  logAuthEvent,
  getRecentAuditLogs,
  clearAuditLog,
  AuditEvents,
  AUDIT_LOG_PATH
};
