/**
 * DOM Utility Functions
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get element by ID with error handling
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} The element or null
 */
export function getById(id) {
  return document.getElementById(id);
}

/**
 * Get all elements matching selector
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element (optional)
 * @returns {NodeList} Matching elements
 */
export function getAll(selector, parent = document) {
  return parent.querySelectorAll(selector);
}

/**
 * Get first element matching selector
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element (optional)
 * @returns {Element|null} First matching element or null
 */
export function get(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Add event listener with error handling
 * @param {Element} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 */
export function on(element, event, handler) {
  if (element && typeof handler === 'function') {
    element.addEventListener(event, handler);
  }
}

/**
 * Remove event listener
 * @param {Element} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 */
export function off(element, event, handler) {
  if (element && typeof handler === 'function') {
    element.removeEventListener(event, handler);
  }
}
