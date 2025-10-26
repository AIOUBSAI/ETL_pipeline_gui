/**
 * Notification Manager
 * Handles desktop notifications and sound alerts
 */

import { getState } from '../core/state.js';
import { soundManager } from './sound-manager.js';

class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.initialized = false;
  }

  /**
   * Initialize the notification manager
   */
  async init() {
    if (this.initialized) return;

    // Request notification permission
    if ('Notification' in window) {
      this.permission = await Notification.requestPermission();
    }

    // Listen for notification events from main process
    if (window.electronAPI && window.electronAPI.onNotification) {
      window.electronAPI.onNotification((data) => {
        this.show(data);
      });
    }

    this.initialized = true;
  }

  /**
   * Show a desktop notification
   * @param {Object} options - Notification options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body
   * @param {string} options.type - Type: 'success', 'error', 'info', 'warning'
   * @param {boolean} options.playSound - Whether to play sound (default: true)
   */
  async show(options) {
    const {
      title,
      body,
      type = 'info',
      playSound = true
    } = options;

    // Check if notifications are enabled in settings
    const settings = getState('settings');
    const notificationsEnabled = settings?.notificationsEnabled !== false;

    // Play sound if enabled
    if (playSound) {
      this.playSound(type);
    }

    // Show desktop notification if enabled and permission granted
    if (notificationsEnabled && this.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body,
          icon: this.getIconForType(type),
          badge: this.getIconForType(type),
          tag: `project-launcher-${Date.now()}`,
          requireInteraction: false,
          silent: true // We handle sound ourselves
        });

        // Focus window when notification is clicked
        notification.onclick = () => {
          if (window.electronAPI && window.electronAPI.focusWindow) {
            window.electronAPI.focusWindow();
          }
          notification.close();
        };

        // Auto-close after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  }

  /**
   * Play sound based on notification type
   * @param {string} type - Notification type
   */
  playSound(type) {
    const settings = getState('settings');
    if (!settings?.soundEnabled) return;

    switch (type) {
      case 'success':
        soundManager.playSuccess();
        break;
      case 'error':
        soundManager.playError();
        break;
      case 'info':
      case 'warning':
        soundManager.playInfo();
        break;
    }
  }

  /**
   * Get icon path for notification type
   * @param {string} type - Notification type
   * @returns {string} Icon data URL
   */
  getIconForType(type) {
    // Return SVG data URLs with theme colors
    const icons = {
      success: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSIyMCIgZmlsbD0iI2E2ZDE4OSIvPjxwYXRoIGQ9Ik0xNiAyNEwyMSAyOUwzMiAxOCIgc3Ryb2tlPSIjMzAzNDQ2IiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==',
      error: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSIyMCIgZmlsbD0iI2U3ODI4NCIvPjxwYXRoIGQ9Ik0xOCAxOEwzMCAzME0zMCAxOEwxOCAzMCIgc3Ryb2tlPSIjMzAzNDQ2IiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==',
      info: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSIyMCIgZmlsbD0iIzhjYWFlZSIvPjxwYXRoIGQ9Ik0yNCAxNlYyNE0yNCAzMkgyNC4wMSIgc3Ryb2tlPSIjMzAzNDQ2IiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==',
      warning: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSIyMCIgZmlsbD0iI2U1Yzg5MCIvPjxwYXRoIGQ9Ik0yNCAxNlYyNE0yNCAzMkgyNC4wMSIgc3Ryb2tlPSIjMzAzNDQ2IiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg=='
    };

    return icons[type] || icons.info;
  }

  /**
   * Show project completion notification
   * @param {Object} data
   * @param {string} data.projectName - Project name
   * @param {boolean} data.success - Whether execution was successful
   * @param {number} data.duration - Execution duration in ms
   * @param {number} data.exitCode - Process exit code
   */
  showProjectCompletion(data) {
    const { projectName, success, duration, exitCode } = data;

    const durationText = duration ? ` in ${(duration / 1000).toFixed(1)}s` : '';

    this.show({
      title: success ? 'Script Completed' : 'Script Failed',
      body: success
        ? `${projectName} finished successfully${durationText}`
        : `${projectName} exited with code ${exitCode}${durationText}`,
      type: success ? 'success' : 'error',
      playSound: true
    });
  }

  /**
   * Show project stopped notification
   * @param {string} projectName - Project name
   */
  showProjectStopped(projectName) {
    this.show({
      title: 'Script Stopped',
      body: `${projectName} was stopped manually`,
      type: 'info',
      playSound: true
    });
  }
}

// Export singleton instance
export const notificationManager = new NotificationManager();
