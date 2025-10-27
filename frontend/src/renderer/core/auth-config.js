/**
 * Authentication Configuration
 * Central configuration for protected views and authentication settings
 */

/**
 * Views that require admin authentication
 * Add or remove views here to control access restrictions
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
 * Default credentials (stored in settings, these are fallbacks)
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
 * User roles
 */
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: null
};

/**
 * Check if a view is protected
 * @param {string} view - View name
 * @returns {boolean} True if view requires admin access
 */
export function isProtectedView(view) {
  return PROTECTED_VIEWS.includes(view);
}

/**
 * Check if user has admin privileges
 * @param {string} userRole - Current user role
 * @returns {boolean} True if user is admin
 */
export function hasAdminPrivileges(userRole) {
  return userRole === USER_ROLES.ADMIN;
}

/**
 * Check if user can access a view
 * @param {string} view - View name
 * @param {string} userRole - Current user role
 * @returns {boolean} True if user can access the view
 */
export function canAccessView(view, userRole) {
  if (!isProtectedView(view)) {
    return true; // Public view
  }
  return hasAdminPrivileges(userRole);
}
