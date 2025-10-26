/**
 * Dashboard Logs Panel
 * Handles log display and filtering
 */

import { getById, getAll } from '../../utils/dom.js';
import { state, setState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatTime } from '../../utils/format.js';
import { showToast } from '../../components/toast.js';

/**
 * Initialize logs panel
 */
export function initializeLogs() {
  const clearLogsBtn = getById('clear-logs-btn');

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      clearLogs();
    });
  }

  // Initialize log filter buttons
  const filterButtons = getAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      setState('currentLogFilter', btn.dataset.filter);
      renderLogs();
    });
  });
}

/**
 * Add a log entry
 * @param {Object} log - Log object
 */
export function addLog(log) {
  state.logs.push(log);

  // Keep only last 1000 logs
  if (state.logs.length > 1000) {
    state.logs = state.logs.slice(-1000);
  }

  renderLogs();
}

/**
 * Clear all logs
 */
export function clearLogs() {
  setState('logs', []);
  renderLogs();
  showToast('Logs cleared', 'info');
}

/**
 * Render logs in the container
 */
export function renderLogs() {
  const container = getById('logs-container');
  if (!container) return;

  // Filter logs based on current filter
  const filteredLogs = state.currentLogFilter === 'all'
    ? state.logs
    : state.logs.filter(log => log.type === state.currentLogFilter);

  if (filteredLogs.length === 0) {
    const message = state.logs.length === 0 ? 'No Logs Yet' : `No ${state.currentLogFilter} logs`;
    const subMessage = state.logs.length === 0
      ? 'Select a folder and run to see logs'
      : 'Try selecting a different filter';

    container.innerHTML = `
      <div class="empty-state-small">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p>${message}</p>
        <small>${subMessage}</small>
      </div>
    `;
    return;
  }

  const logList = document.createElement('div');
  logList.className = 'log-list';

  filteredLogs.forEach(log => {
    const logEntry = createLogEntry(log);
    logList.appendChild(logEntry);
  });

  container.innerHTML = '';
  container.appendChild(logList);

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/**
 * Create a log entry element
 * @param {Object} log - Log object
 * @returns {HTMLElement} Log entry element
 */
function createLogEntry(log) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${log.type}`;

  const time = formatTime(log.timestamp);

  entry.innerHTML = `
    <div class="log-timestamp">${time}</div>
    <div class="log-type-badge">
      <span class="log-type-label">${log.type}</span>
    </div>
    <div class="log-message">${escapeHtml(log.message)}</div>
  `;

  return entry;
}
