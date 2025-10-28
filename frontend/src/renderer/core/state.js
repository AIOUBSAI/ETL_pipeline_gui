/**
 * Application State Management
 * Central store for application state
 * @module core/state
 */

/**
 * @typedef {import('../types.js').ViewName} ViewName
 * @typedef {import('../types.js').Project} Project
 * @typedef {import('../types.js').LogEntry} LogEntry
 * @typedef {import('../types.js').LogFilter} LogFilter
 * @typedef {import('../types.js').UserRole} UserRole
 * @typedef {import('../types.js').Settings} Settings
 * @typedef {import('../types.js').Pipeline} Pipeline
 * @typedef {import('../types.js').QueryResult} QueryResult
 */

/**
 * Application state shape
 * @typedef {Object} AppState
 * @property {ViewName} currentView - Current active view
 * @property {Array<Project>} projects - List of available projects
 * @property {string|null} selectedProjectPath - Currently selected project path
 * @property {Array<LogEntry>} logs - Application log entries
 * @property {LogFilter} currentLogFilter - Active log filter
 * @property {boolean} isRunning - Whether pipeline is currently running
 * @property {boolean} sidebarVisible - Sidebar visibility state
 * @property {boolean} isAdminLoggedIn - Admin authentication status
 * @property {UserRole|null} currentUser - Current user role
 * @property {Settings} settings - Application settings
 * @property {Array<Pipeline>} pipelines - Available pipelines
 * @property {Pipeline|null} currentPipeline - Currently selected pipeline
 * @property {Object|null} pipelineValidation - Pipeline validation results
 * @property {Object|null} pipelineExecutionStatus - Pipeline execution status
 * @property {Array<Object>} transformFiles - Transform files in editor
 * @property {Object|null} currentFile - Currently open file in editor
 * @property {boolean} unsavedChanges - Whether editor has unsaved changes
 * @property {Array<Object>} databases - Available databases
 * @property {Object|null} currentDatabase - Currently selected database
 * @property {Array<string>} schemas - Database schemas
 * @property {Array<string>} tables - Database tables
 * @property {QueryResult|null} queryResults - Last query results
 * @property {Array<Object>} reports - Available reports
 * @property {Object|null} currentReport - Currently selected report
 */

/**
 * Application state
 * @type {AppState}
 */
export const state = {
  currentView: 'dashboard',
  projects: [],
  selectedProjectPath: null,
  logs: [],
  currentLogFilter: 'all',
  isRunning: false,
  sidebarVisible: false,
  isAdminLoggedIn: false,
  currentUser: null,
  settings: {
    rootFolder: '',
    etlProjectPath: '',
    theme: 'catppuccin-frappe',
    pythonPath: 'python',
    notificationsEnabled: true,
    soundEnabled: true,
    soundVolume: 0.7,
    // Pipeline settings
    etlBackendPath: '',
    pipelineConfigPath: '',
    databasePath: '',
    transformsPath: '',
    reportsPath: '',
    defaultValidateBeforeRun: true,
    autoRefreshInterval: 5000,
    maxLogLines: 1000,
    autoGenerateReports: true,
    queryTimeout: 30000,
    maxQueryResults: 10000,
    enableReadOnlyMode: true
  },

  // Pipeline State
  pipelines: [],
  currentPipeline: null,
  pipelineValidation: null,
  pipelineExecutionStatus: null,

  // Editor State
  transformFiles: [],
  currentFile: null,
  unsavedChanges: false,

  // Database State
  databases: [],
  currentDatabase: null,
  schemas: [],
  tables: [],
  queryResults: null,

  // Reports State
  reports: [],
  currentReport: null
};

// State change listeners
const listeners = new Map();

/**
 * Subscribe to state changes
 * @template {keyof AppState} K
 * @param {K} key - State key to watch
 * @param {(newValue: AppState[K], oldValue: AppState[K]) => void} callback - Callback function receiving new and old values
 * @returns {() => void} Unsubscribe function
 */
export function subscribe(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);

  // Return unsubscribe function
  return () => {
    const callbacks = listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
    }
  };
}

/**
 * Update state and notify listeners
 * @template {keyof AppState} K
 * @param {K} key - State key
 * @param {AppState[K]} value - New value
 */
export function setState(key, value) {
  const oldValue = state[key];
  state[key] = value;

  // Notify listeners
  const callbacks = listeners.get(key);
  if (callbacks) {
    callbacks.forEach(callback => callback(value, oldValue));
  }
}

/**
 * Get state value
 * @template {keyof AppState} K
 * @param {K} key - State key
 * @returns {AppState[K]} State value
 */
export function getState(key) {
  return state[key];
}

/**
 * Update nested state (e.g., settings.theme)
 * @template {keyof AppState} P
 * @param {P} parentKey - Parent state key
 * @param {string} childKey - Child property key
 * @param {any} value - New value
 */
export function setNestedState(parentKey, childKey, value) {
  const parent = state[parentKey];
  if (parent && typeof parent === 'object') {
    parent[childKey] = value;
    setState(parentKey, { ...parent });
  }
}
