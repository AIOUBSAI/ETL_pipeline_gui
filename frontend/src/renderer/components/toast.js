/**
 * Toast Notification Component
 * Displays temporary notification messages
 */

import { escapeHtml } from '../utils/dom.js';
import { createIconString, IconNames } from '../utils/icons.js';

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (info, success, error)
 * @param {string} title - Toast title (optional)
 * @param {boolean} autoClose - Auto close after 5 seconds
 */
export function showToast(message, type = 'info', title = '', autoClose = true) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconName = '';
  let defaultTitle = '';

  switch (type) {
    case 'success':
      iconName = IconNames.CHECK;
      defaultTitle = title || 'Success';
      break;
    case 'error':
      iconName = IconNames.X_CIRCLE;
      defaultTitle = title || 'Error';
      break;
    default:
      iconName = IconNames.INFO;
      defaultTitle = title || 'Information';
  }

  const icon = createIconString(iconName, { size: 20 });
  const closeIcon = createIconString(IconNames.CLOSE, { size: 14 });

  toast.innerHTML = `
    <div class="toast-header">
      <div class="toast-title">
        ${icon}
        <span>${escapeHtml(defaultTitle)}</span>
      </div>
      <button class="toast-close">
        ${closeIcon}
      </button>
    </div>
    <div class="toast-content">
      ${escapeHtml(message)}
    </div>
    <div class="toast-footer">
      <button class="btn btn-primary btn-sm toast-ok-btn">OK</button>
    </div>
  `;

  document.body.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  const okBtn = toast.querySelector('.toast-ok-btn');

  const closeToast = () => {
    toast.style.animation = 'notificationFadeOut 0.3s ease';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  };

  closeBtn.addEventListener('click', closeToast);
  okBtn.addEventListener('click', closeToast);

  if (autoClose) {
    setTimeout(closeToast, 5000);
  }
}
