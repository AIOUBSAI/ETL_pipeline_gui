import { getState, setState } from '../core/state.js';
import { closeDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { loadDialog } from '../utils/templateLoader.js';
import { PROTECTED_VIEWS, USER_ROLES, SECURITY_CONFIG } from '../core/auth-config.js';
import { extractData } from '../utils/ipc-handler.js';

// Login attempt tracking
const loginAttempts = new Map();  // username -> { count, lockedUntil }

// Session timeout tracking
let sessionTimeoutId = null;
let sessionWarningTimeoutId = null;
let lastActivityTime = Date.now();

/**
 * Initialize the login dialog
 */
export async function initializeLoginDialog() {
  // Load the login dialog template
  await loadDialog('login', 'templates/dialogs/login.html');

  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const loginButton = document.getElementById('login-button');
  const cancelButton = document.getElementById('login-cancel-button');

  if (!loginForm) return;

  // Handle form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  // Handle login button click
  loginButton?.addEventListener('click', async () => {
    await handleLogin();
  });

  // Handle cancel button
  cancelButton?.addEventListener('click', () => {
    closeDialog('login');
    usernameInput.value = '';
    passwordInput.value = '';
  });

  // Handle dialog opened event to focus username input
  document.addEventListener('dialogOpened', (e) => {
    if (e.detail.dialogName === 'login') {
      usernameInput?.focus();
    }
  });

  // Setup activity tracking for session timeout
  setupActivityTracking();

  /**
   * Handle login attempt
   */
  async function handleLogin() {
    const username = usernameInput?.value.trim();
    const password = passwordInput?.value;

    if (!username || !password) {
      showToast('Please enter username and password', 'error');
      return;
    }

    // Check if user is locked out
    const lockoutInfo = loginAttempts.get(username);
    if (lockoutInfo && lockoutInfo.lockedUntil && Date.now() < lockoutInfo.lockedUntil) {
      const remainingMinutes = Math.ceil((lockoutInfo.lockedUntil - Date.now()) / 60000);
      showToast(`Account locked. Try again in ${remainingMinutes} minute(s)`, 'error');
      return;
    }

    // Determine role based on username pattern (check both admin and user)
    let role = null;
    try {
      const settings = await window.electronAPI.getSettings();
      const credentials = settings.credentials;

      if (username === credentials?.admin?.username) {
        role = USER_ROLES.ADMIN;
      } else if (username === credentials?.user?.username) {
        role = USER_ROLES.USER;
      } else {
        // Unknown username
        handleFailedLogin(username);
        showToast('Invalid username or password', 'error');
        passwordInput.value = '';
        passwordInput.focus();
        return;
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      showToast('Login failed. Please try again.', 'error');
      return;
    }

    try {
      // Verify credentials with backend (secure)
      const response = await window.electronAPI.verifyCredentials({
        username,
        password,
        role
      });
      const result = extractData(response);

      if (result.valid) {
        // Clear failed attempts
        loginAttempts.delete(username);

        // Set authentication state
        const isAdmin = role === USER_ROLES.ADMIN;
        setState('isAdminLoggedIn', isAdmin);
        setState('currentUser', role);
        sessionStorage.setItem('isAdminLoggedIn', isAdmin.toString());
        sessionStorage.setItem('currentUser', role);
        sessionStorage.setItem('loginTime', Date.now().toString());

        // Start session timeout
        startSessionTimeout();

        // Show success message
        const roleLabel = isAdmin ? 'Admin' : 'User (limited access)';
        showToast(`Logged in as ${roleLabel}`, 'success');
        closeDialog('login');

        // Clear form
        usernameInput.value = '';
        passwordInput.value = '';

        // Trigger custom event for successful login
        const eventName = isAdmin ? 'adminLoginSuccess' : 'userLoginSuccess';
        document.dispatchEvent(new CustomEvent(eventName));

        // Navigate to requested view if any
        const requestedView = sessionStorage.getItem('requestedView');
        if (requestedView) {
          sessionStorage.removeItem('requestedView');
          document.dispatchEvent(new CustomEvent('navigationRequested', {
            detail: { view: requestedView }
          }));
        }
      } else {
        handleFailedLogin(username);
        showToast('Invalid username or password', 'error');
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (error) {
      console.error('Login error:', error);
      showToast('Login failed. Please try again.', 'error');
    }
  }
}

/**
 * Handle failed login attempt
 * @param {string} username - Username that failed
 */
function handleFailedLogin(username) {
  const attempts = loginAttempts.get(username) || { count: 0, lockedUntil: null };
  attempts.count += 1;

  // Check if user should be locked out
  if (attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_DURATION_MS;
    attempts.count = 0; // Reset count
    showToast(`Too many failed attempts. Account locked for 5 minutes`, 'error');
  }

  loginAttempts.set(username, attempts);
}

/**
 * Setup activity tracking for session timeout
 */
function setupActivityTracking() {
  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

  activityEvents.forEach(event => {
    document.addEventListener(event, () => {
      lastActivityTime = Date.now();

      // If user is logged in, reset session timeout
      if (getState('currentUser')) {
        resetSessionTimeout();
      }
    }, { passive: true });
  });
}

/**
 * Start session timeout
 */
function startSessionTimeout() {
  // Clear any existing timeouts
  clearTimeout(sessionTimeoutId);
  clearTimeout(sessionWarningTimeoutId);

  // Set warning timeout (2 minutes before actual timeout)
  sessionWarningTimeoutId = setTimeout(() => {
    const currentUser = getState('currentUser');
    if (currentUser) {
      showToast('Your session will expire in 2 minutes due to inactivity', 'warning');
    }
  }, SECURITY_CONFIG.SESSION_TIMEOUT_MS - SECURITY_CONFIG.SESSION_WARNING_MS);

  // Set actual timeout
  sessionTimeoutId = setTimeout(() => {
    const currentUser = getState('currentUser');
    if (currentUser) {
      showToast('Session expired due to inactivity', 'info');
      logoutAdmin('SESSION_TIMEOUT');
    }
  }, SECURITY_CONFIG.SESSION_TIMEOUT_MS);
}

/**
 * Reset session timeout (on user activity)
 */
function resetSessionTimeout() {
  const loginTime = sessionStorage.getItem('loginTime');
  if (!loginTime) return;

  // Check if user is still active
  const timeSinceLogin = Date.now() - parseInt(loginTime, 10);
  if (timeSinceLogin < SECURITY_CONFIG.SESSION_TIMEOUT_MS) {
    startSessionTimeout();
  }
}

/**
 * Check if admin is logged in (from session)
 */
export function checkAdminSession() {
  const isLoggedIn = sessionStorage.getItem('isAdminLoggedIn') === 'true';
  const currentUser = sessionStorage.getItem('currentUser');
  const loginTime = sessionStorage.getItem('loginTime');

  // Check if session has expired
  if (loginTime) {
    const timeSinceLogin = Date.now() - parseInt(loginTime, 10);
    if (timeSinceLogin > SECURITY_CONFIG.SESSION_TIMEOUT_MS) {
      // Session expired
      sessionStorage.removeItem('isAdminLoggedIn');
      sessionStorage.removeItem('currentUser');
      sessionStorage.removeItem('loginTime');
      setState('isAdminLoggedIn', false);
      setState('currentUser', null);
      return false;
    }
  }

  // Only set state if there's actually a user logged in
  if (currentUser && currentUser !== 'null' && currentUser !== 'undefined') {
    setState('isAdminLoggedIn', isLoggedIn);
    setState('currentUser', currentUser);

    // Restart session timeout
    if (isLoggedIn || currentUser === USER_ROLES.USER) {
      startSessionTimeout();
    }
  } else {
    // Ensure clean state when no user is logged in
    setState('isAdminLoggedIn', false);
    setState('currentUser', null);
  }

  return isLoggedIn;
}

/**
 * Logout admin or user
 * @param {string} reason - Reason for logout (SESSION_TIMEOUT, USER_ACTION)
 */
export function logoutAdmin(reason = 'USER_ACTION') {
  // Clear session timeouts
  clearTimeout(sessionTimeoutId);
  clearTimeout(sessionWarningTimeoutId);

  // Clear state
  setState('isAdminLoggedIn', false);
  setState('currentUser', null);
  sessionStorage.removeItem('isAdminLoggedIn');
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('loginTime');

  if (reason !== 'SESSION_TIMEOUT') {
    showToast('Logged out successfully', 'info');
  }

  // If on a protected route, navigate to dashboard
  const currentView = getState('currentView');

  if (PROTECTED_VIEWS.includes(currentView)) {
    document.dispatchEvent(new CustomEvent('navigationRequested', {
      detail: { view: 'dashboard' }
    }));
  }

  // Trigger custom event for logout
  document.dispatchEvent(new CustomEvent('adminLogout'));
}
