import { getState, setState } from '../core/state.js';
import { closeDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { loadDialog } from '../utils/templateLoader.js';
import { PROTECTED_VIEWS, DEFAULT_CREDENTIALS, USER_ROLES } from '../core/auth-config.js';

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

    try {
      // Get settings to check credentials
      const settings = await window.electronAPI.getSettings();
      const credentials = settings.credentials || DEFAULT_CREDENTIALS;

      // Check if admin credentials match
      if (username === credentials.admin.username && password === credentials.admin.password) {
        // Admin login successful
        setState('isAdminLoggedIn', true);
        setState('currentUser', USER_ROLES.ADMIN);
        sessionStorage.setItem('isAdminLoggedIn', 'true');
        sessionStorage.setItem('currentUser', USER_ROLES.ADMIN);

        showToast('Logged in as Admin', 'success');
        closeDialog('login');

        // Clear form
        usernameInput.value = '';
        passwordInput.value = '';

        // Trigger custom event for successful admin login
        document.dispatchEvent(new CustomEvent('adminLoginSuccess'));
      }
      // Check if user credentials match
      else if (username === credentials.user.username && password === credentials.user.password) {
        // User login successful (limited access)
        setState('isAdminLoggedIn', false);
        setState('currentUser', USER_ROLES.USER);
        sessionStorage.setItem('isAdminLoggedIn', 'false');
        sessionStorage.setItem('currentUser', USER_ROLES.USER);

        showToast('Logged in as User (limited access)', 'info');
        closeDialog('login');

        // Clear form
        usernameInput.value = '';
        passwordInput.value = '';

        // Trigger custom event for user login
        document.dispatchEvent(new CustomEvent('userLoginSuccess'));
      }
      else {
        showToast('Invalid username or password', 'error');
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (error) {
      showToast('Login failed. Please try again.', 'error');
    }
  }
}

/**
 * Check if admin is logged in (from session)
 */
export function checkAdminSession() {
  const isLoggedIn = sessionStorage.getItem('isAdminLoggedIn') === 'true';
  const currentUser = sessionStorage.getItem('currentUser');

  // Only set state if there's actually a user logged in
  if (currentUser && currentUser !== 'null' && currentUser !== 'undefined') {
    setState('isAdminLoggedIn', isLoggedIn);
    setState('currentUser', currentUser);
  } else {
    // Ensure clean state when no user is logged in
    setState('isAdminLoggedIn', false);
    setState('currentUser', null);
  }

  return isLoggedIn;
}

/**
 * Logout admin or user
 */
export function logoutAdmin() {
  setState('isAdminLoggedIn', false);
  setState('currentUser', null);
  sessionStorage.removeItem('isAdminLoggedIn');
  sessionStorage.removeItem('currentUser');
  showToast('Logged out successfully', 'info');

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
