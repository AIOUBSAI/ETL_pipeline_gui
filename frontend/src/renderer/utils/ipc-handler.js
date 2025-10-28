/**
 * IPC Response Handler Utility
 * Helper functions for handling standardized IPC responses in renderer
 */

/**
 * Extract data from standardized IPC response
 * @param {Object} response - IPC response with { success, ...data } or { success, error, ...defaults }
 * @param {string} [dataKey] - Optional specific key to extract from response
 * @returns {*} Extracted data or throws error if response failed
 *
 * @example
 * // Extract specific field
 * const path = extractData(response, 'path'); // Returns response.path
 *
 * // Extract all data fields (excluding success/error)
 * const data = extractData(response); // Returns { ...response without success/error }
 */
export function extractData(response, dataKey = null) {
  // Handle null/undefined response
  if (!response) {
    throw new Error('IPC response is null or undefined');
  }

  // Check if response failed
  if (response.success === false) {
    throw new Error(response.error || 'IPC request failed');
  }

  // Extract specific key if requested
  if (dataKey) {
    return response[dataKey];
  }

  // Extract all data (remove success/error keys)
  const { success, error, ...data } = response;

  // If only one data field, return it directly
  const keys = Object.keys(data);
  if (keys.length === 1) {
    return data[keys[0]];
  }

  // Return all data fields
  return data;
}

/**
 * Safe IPC call with automatic error handling and data extraction
 * @param {Function} ipcCall - The IPC function to call
 * @param {string} [dataKey] - Optional specific key to extract
 * @returns {Promise<*>} Extracted data or throws error
 *
 * @example
 * const path = await safeIpcCall(() => window.electronAPI.selectRootFolder(), 'path');
 * const settings = await safeIpcCall(() => window.electronAPI.getSettings(), 'settings');
 */
export async function safeIpcCall(ipcCall, dataKey = null) {
  try {
    const response = await ipcCall();
    return extractData(response, dataKey);
  } catch (error) {
    console.error('IPC call failed:', error);
    throw error;
  }
}

/**
 * Check if IPC response was successful
 * @param {Object} response - IPC response
 * @returns {boolean} True if successful
 */
export function isSuccess(response) {
  return response && response.success === true;
}

/**
 * Get error message from failed IPC response
 * @param {Object} response - IPC response
 * @returns {string|null} Error message or null if successful
 */
export function getError(response) {
  if (response && response.success === false) {
    return response.error || 'Unknown error';
  }
  return null;
}
