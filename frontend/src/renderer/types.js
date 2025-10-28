/**
 * Shared type definitions for the ETL Pipeline GUI frontend
 * @module types
 */

/**
 * Standard IPC response wrapper
 * @typedef {Object} IpcResponse
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} [error] - Error message if operation failed
 */

/**
 * Application settings structure
 * @typedef {Object} Settings
 * @property {string} rootFolder - Root folder for projects
 * @property {string} etlProjectPath - Path to ETL project
 * @property {string} theme - Active theme name (e.g., 'catppuccin-frappe', 'dracula', 'nord')
 * @property {string} pythonPath - Path to Python executable
 * @property {boolean} notificationsEnabled - Whether notifications are enabled
 * @property {boolean} soundEnabled - Whether sound effects are enabled
 * @property {number} soundVolume - Volume level (0-1)
 * @property {Credentials} credentials - User credentials
 */

/**
 * User credentials structure
 * @typedef {Object} Credentials
 * @property {string} username - Username
 * @property {string} password - Hashed password (salt:hash format)
 * @property {'admin'|'user'} role - User role
 * @property {number} [failedAttempts] - Number of failed login attempts
 * @property {number} [lockedUntil] - Timestamp when account lock expires
 */

/**
 * Project information
 * @typedef {Object} Project
 * @property {string} name - Project name
 * @property {string} path - Full path to project directory
 * @property {string} lastModified - Last modification timestamp (ISO format)
 */

/**
 * Log entry structure
 * @typedef {Object} LogEntry
 * @property {'info'|'warning'|'error'|'success'} type - Log level/type
 * @property {string} message - Log message content
 * @property {string} timestamp - Timestamp in ISO format
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Pipeline configuration
 * @typedef {Object} Pipeline
 * @property {string} name - Pipeline name
 * @property {string} path - Path to pipeline YAML file
 * @property {string} [description] - Optional description
 */

/**
 * Database query result
 * @typedef {Object} QueryResult
 * @property {Array<Object>} columns - Column metadata
 * @property {Array<Array<any>>} rows - Result rows
 */

/**
 * Theme metadata
 * @typedef {Object} ThemeMetadata
 * @property {string} name - Theme name
 * @property {string} path - Path to theme CSS file
 * @property {boolean} [builtin] - Whether theme is built-in
 */

/**
 * File metadata from file system
 * @typedef {Object} FileInfo
 * @property {string} path - Full file path
 * @property {number} size - File size in bytes
 * @property {string} lastModified - Last modification timestamp (ISO format)
 */

/**
 * Component initialization result
 * @typedef {Object} InitResult
 * @property {boolean} success - Whether initialization succeeded
 * @property {string} componentName - Name of the component
 * @property {number} duration - Initialization duration in milliseconds
 * @property {Error} [error] - Error object if initialization failed
 */

/**
 * Error boundary options
 * @typedef {Object} ErrorBoundaryOptions
 * @property {Function} [onError] - Custom error handler callback
 * @property {string} [targetViewId] - DOM element ID to display error UI
 * @property {boolean} [showErrorUI] - Whether to show error UI (default: true)
 * @property {boolean} [critical] - Whether error should be treated as critical
 */

/**
 * Modal dialog options
 * @typedef {Object} DialogOptions
 * @property {string} title - Dialog title
 * @property {string} message - Dialog message
 * @property {string} [confirmText] - Confirm button text (default: 'OK')
 * @property {string} [cancelText] - Cancel button text (default: 'Cancel')
 * @property {'info'|'warning'|'error'|'success'} [type] - Dialog type
 */

/**
 * Toast notification options
 * @typedef {Object} ToastOptions
 * @property {string} message - Toast message
 * @property {'info'|'warning'|'error'|'success'} [type] - Toast type (default: 'info')
 * @property {number} [duration] - Display duration in milliseconds (default: 3000)
 */

/**
 * Child process information
 * @typedef {Object} ProcessInfo
 * @property {number} pid - Process ID
 * @property {string} command - Command that was executed
 * @property {number} startTime - Start timestamp
 */

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [error] - Error message if validation failed
 */

/**
 * Audio feedback type
 * @typedef {'success'|'error'|'warning'|'click'} AudioType
 */

/**
 * View names in the application
 * @typedef {'dashboard'|'pipeline'|'editor'|'database'|'reports'} ViewName
 */

/**
 * User role types
 * @typedef {'admin'|'user'} UserRole
 */

/**
 * Log filter types
 * @typedef {'all'|'info'|'warning'|'error'|'success'} LogFilter
 */

export {
  // Export as namespace for documentation
  // Types are available through JSDoc comments
};
