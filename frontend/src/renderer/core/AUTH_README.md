# Authentication System

## Overview

The authentication system protects certain views from unauthorized access. It uses a centralized configuration to make it easy to add, remove, or modify protected views.

## Quick Guide: Adding/Removing Protected Views

### To Add a Protected View

1. Open [auth-config.js](auth-config.js)
2. Add the view name to the `PROTECTED_VIEWS` array:

```javascript
export const PROTECTED_VIEWS = [
  'pipeline',
  'editor',
  'database',
  'reports',
  'my-new-view'  // Add your view here
];
```

That's it! The view will now require admin login to access.

### To Remove a Protected View

1. Open [auth-config.js](auth-config.js)
2. Remove the view name from the `PROTECTED_VIEWS` array:

```javascript
export const PROTECTED_VIEWS = [
  'pipeline',
  'editor',
  // 'database',  // Commented out or removed
  'reports'
];
```

The view will now be accessible without authentication.

## Architecture

### Core Files

- **[auth-config.js](auth-config.js)** - Central configuration for all auth settings
- **[../dialogs/login.js](../dialogs/login.js)** - Login dialog and authentication logic
- **[../components/sidebar.js](../components/sidebar.js)** - Navigation protection

### How It Works

1. **Navigation Request**: User clicks on a sidebar item
2. **Protection Check**: System checks if view is in `PROTECTED_VIEWS` array
3. **Auth Check**: If protected, checks if user has admin role
4. **Action**:
   - If authenticated → Navigate to view
   - If not authenticated → Show login dialog

### State Management

The system uses two state variables:
- `isAdminLoggedIn` (boolean) - Whether user has admin privileges
- `currentUser` (string|null) - Current user role ('admin', 'user', or null)

### Session Persistence

Login state persists across page refreshes using `sessionStorage`:
- `isAdminLoggedIn` - Stored as 'true' or removed
- `currentUser` - Stored as role string or removed
- `requestedView` - Temporarily stores view user tried to access before login

## User Roles

Defined in `auth-config.js`:

```javascript
export const USER_ROLES = {
  ADMIN: 'admin',    // Full access to all views
  USER: 'user',      // Limited access (no protected views)
  GUEST: null        // Not logged in
};
```

## Helper Functions

### `isProtectedView(view)`

Check if a view requires authentication:

```javascript
import { isProtectedView } from '../core/auth-config.js';

if (isProtectedView('editor')) {
  // This view is protected
}
```

## Events

The system emits custom events for coordination:

- `adminLoginSuccess` - Admin successfully logged in
- `userLoginSuccess` - Regular user successfully logged in
- `adminLogout` - User logged out
- `navigationRequested` - Request to navigate to a view

## Credentials

Default credentials are defined in `auth-config.js`:

```javascript
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
```

These are fallbacks. The actual credentials are stored in user settings and can be customized via the Settings dialog.

## Visual Feedback

Protected views in the sidebar are visually indicated when user is not authenticated:
- Opacity reduced to 50%
- Cursor changes to "not-allowed"
- `disabled` class added
- Click triggers login dialog instead of navigation

After successful login:
- Views unlock automatically
- Visual state updates
- User navigates to requested view

## Example: Creating a New Protected Feature

1. **Add the view to your HTML** (if not already present):
```html
<div id="my-feature-view" class="view">
  <!-- Your content -->
</div>
```

2. **Add navigation item to sidebar**:
```html
<a class="nav-item" data-view="my-feature">
  <i data-icon="shield-check"></i>
  <span>My Feature</span>
</a>
```

3. **Protect the view**:
```javascript
// In auth-config.js
export const PROTECTED_VIEWS = [
  'pipeline',
  'editor',
  'database',
  'reports',
  'my-feature'  // Add here
];
```

Done! Your feature is now protected and requires admin login.

## Debugging

To check auth state in browser console:

```javascript
// Check if admin is logged in
window.state.isAdminLoggedIn

// Check current user
window.state.currentUser

// Check session storage
sessionStorage.getItem('isAdminLoggedIn')
sessionStorage.getItem('currentUser')

// List all protected views
import('./core/auth-config.js').then(m => console.log(m.PROTECTED_VIEWS))
```

## Migration Notes

The previous system had duplicate definitions of protected views in multiple files. This has been consolidated into a single source of truth in `auth-config.js`.

If you're maintaining old code that imports from the old locations, they still work via re-exports for backward compatibility.
