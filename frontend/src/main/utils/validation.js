/**
 * Validation Utilities
 * Reusable validation functions for IPC handlers
 */

const fs = require('fs');
const path = require('path');

/**
 * Assert that a file exists
 * @param {string} filePath - Path to file
 * @param {string} label - Descriptive label for error message (default: 'File')
 * @throws {Error} If file doesn't exist
 */
function assertFileExists(filePath, label = 'File') {
  if (!filePath) {
    throw new Error(`${label} path is required`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`${label} path is not a file: ${filePath}`);
  }
}

/**
 * Assert that a directory exists
 * @param {string} dirPath - Path to directory
 * @param {string} label - Descriptive label for error message (default: 'Directory')
 * @throws {Error} If directory doesn't exist
 */
function assertDirectoryExists(dirPath, label = 'Directory') {
  if (!dirPath) {
    throw new Error(`${label} path is required`);
  }

  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} not found: ${dirPath}`);
  }

  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`${label} path is not a directory: ${dirPath}`);
  }
}

/**
 * Check if a file exists (non-throwing)
 * @param {string} filePath - Path to file
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
  try {
    return filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists (non-throwing)
 * @param {string} dirPath - Path to directory
 * @returns {boolean} True if directory exists
 */
function directoryExists(dirPath) {
  try {
    return dirPath && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Validate file extension
 * @param {string} filePath - Path to file
 * @param {string|string[]} extensions - Expected extension(s) (e.g., '.json' or ['.yaml', '.yml'])
 * @param {string} label - Descriptive label for error message
 * @throws {Error} If extension doesn't match
 */
function assertFileExtension(filePath, extensions, label = 'File') {
  const ext = path.extname(filePath).toLowerCase();
  const expectedExts = Array.isArray(extensions) ? extensions : [extensions];

  if (!expectedExts.some(e => ext === e.toLowerCase())) {
    throw new Error(
      `${label} must have extension ${expectedExts.join(' or ')}, got: ${ext || '(none)'}`
    );
  }
}

/**
 * Ensure parent directory exists (create if needed)
 * @param {string} filePath - Path to file
 * @throws {Error} If parent directory can't be created
 */
function ensureParentDirectory(filePath) {
  const parentDir = path.dirname(filePath);

  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
}

module.exports = {
  assertFileExists,
  assertDirectoryExists,
  fileExists,
  directoryExists,
  assertFileExtension,
  ensureParentDirectory
};
