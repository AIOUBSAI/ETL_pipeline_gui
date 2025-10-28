/**
 * Authentication Configuration
 * Central configuration for protected views and authentication settings
 * @module core/auth-config
 */

/**
 * @typedef {import('../types.js').ViewName} ViewName
 * @typedef {import('../types.js').UserRole} UserRole
 */

/**
 * Security configuration constants
 * @typedef {Object} SecurityConfig
 * @property {number} MAX_LOGIN_ATTEMPTS - Maximum failed login attempts before lockout
 * @property {number} LOCKOUT_DURATION_MS - Account lockout duration in milliseconds
 * @property {number} SESSION_TIMEOUT_MS - Session timeout duration in milliseconds
 * @property {number} SESSION_WARNING_MS - Warning time before session timeout in milliseconds
 */

/**
 * Security configuration
 * @type {SecurityConfig}
 */
export const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  SESSION_WARNING_MS: 2 * 60 * 1000, // 2 minutes before timeout
};

/**
 * Views that require admin authentication
 * Add or remove views here to control access restrictions
 * @type {Array<ViewName>}
 */
/*export const PROTECTED_VIEWS = [
  'pipeline',
  'editor',
  'database',
  'reports'
];*/
export const PROTECTED_VIEWS = [
  'reports'
];

/**
 * Default credentials structure
 * @typedef {Object} DefaultCredentials
 * @property {Object} admin - Admin credentials
 * @property {string} admin.username - Admin username
 * @property {string} admin.password - Admin password
 * @property {Object} user - User credentials
 * @property {string} user.username - User username
 * @property {string} user.password - User password
 */

/**
 * Default credentials (stored in settings, these are fallbacks)
 * @type {DefaultCredentials}
 */
export const DEFAULT_CREDENTIALS = {
  admin: {
    username: 'admin',
    password: 'admin'
  },
  user: {
    username: 'user',
    password: 'user'
  }
};

/**
 * User role constants
 * @type {Object.<string, UserRole|null>}
 */
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: null
};

/**
 * Check if a view is protected (requires admin authentication)
 * @param {ViewName} view - View name to check
 * @returns {boolean} True if view requires admin access
 */
export function isProtectedView(view) {
  return PROTECTED_VIEWS.includes(view);
}

