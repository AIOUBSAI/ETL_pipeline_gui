/**
 * Application State Management
 * Central store for application state
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
 * @param {string} key - State key to watch
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
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
 * @param {string} key - State key
 * @param {any} value - New value
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
 * @param {string} key - State key
 * @returns {any} State value
 */
export function getState(key) {
  return state[key];
}

/**
 * Update nested state (e.g., settings.theme)
 * @param {string} parentKey - Parent key
 * @param {string} childKey - Child key
 * @param {any} value - New value
 */
export function setNestedState(parentKey, childKey, value) {
  const parent = state[parentKey];
  if (parent && typeof parent === 'object') {
    parent[childKey] = value;
    setState(parentKey, { ...parent });
  }
}
