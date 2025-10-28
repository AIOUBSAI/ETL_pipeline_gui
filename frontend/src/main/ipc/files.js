const { ipcMain, dialog } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const { getSettings } = require('../utils/settings');
const { successResponse, errorResponse } = require('../utils/ipc-response');

/**
 * Register file operation IPC handlers
 */
function registerFileHandlers() {
  // Read file content
  ipcMain.handle('file:read', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      return successResponse({
        content,
        path: filePath,
        size: stats.size,
        lastModified: stats.mtime
      });
    } catch (error) {
      return errorResponse(error, { content: '', path: null, size: 0, lastModified: null });
    }
  });

  // Write file content
  ipcMain.handle('file:write', async (event, filePath, content) => {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Write the file
      await fs.writeFile(filePath, content, 'utf-8');

      return successResponse({ path: filePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // List files in directory
  ipcMain.handle('file:list', async (event, directory, options = {}) => {
    try {
      if (!fs.existsSync(directory)) {
        return successResponse({ files: [] });
      }

      const pattern = options.pattern || '*';
      const recursive = options.recursive || false;
      const files = [];

      const scanDirectory = (dir, depth = 0) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        entries.forEach(entry => {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(directory, fullPath);

          if (entry.isFile()) {
            // Apply pattern filter if specified
            if (pattern === '*' || entry.name.match(new RegExp(pattern))) {
              const stats = fs.statSync(fullPath);
              files.push({
                name: entry.name,
                path: fullPath,
                relativePath,
                size: stats.size,
                lastModified: stats.mtime,
                extension: path.extname(entry.name)
              });
            }
          } else if (entry.isDirectory() && recursive && depth < 5) {
            // Recursively scan subdirectories (max depth 5)
            scanDirectory(fullPath, depth + 1);
          }
        });
      };

      scanDirectory(directory);

      // Sort by last modified (newest first)
      files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      return successResponse({ files });
    } catch (error) {
      return errorResponse(error, { files: [] });
    }
  });

  // Delete file
  ipcMain.handle('file:delete', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      await fs.remove(filePath);

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Create new file with template
  ipcMain.handle('file:create', async (event, filePath, content = '') => {
    try {
      // Check if file already exists
      if (fs.existsSync(filePath)) {
        throw new Error(`File already exists: ${filePath}`);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Create the file
      await fs.writeFile(filePath, content, 'utf-8');

      return successResponse({ path: filePath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Rename/move file
  ipcMain.handle('file:rename', async (event, oldPath, newPath) => {
    try {
      if (!fs.existsSync(oldPath)) {
        throw new Error(`File not found: ${oldPath}`);
      }

      if (fs.existsSync(newPath)) {
        throw new Error(`Destination file already exists: ${newPath}`);
      }

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(newPath));

      // Move/rename the file
      await fs.move(oldPath, newPath);

      return successResponse({ path: newPath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Copy file
  ipcMain.handle('file:copy', async (event, sourcePath, destPath) => {
    try {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`File not found: ${sourcePath}`);
      }

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destPath));

      // Copy the file
      await fs.copyFile(sourcePath, destPath);

      return successResponse({ path: destPath });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Check if file/directory exists
  ipcMain.handle('file:exists', async (event, filePath) => {
    try {
      const exists = fs.existsSync(filePath);
      let type = null;

      if (exists) {
        const stats = await fs.stat(filePath);
        type = stats.isDirectory() ? 'directory' : 'file';
      }

      return successResponse({ exists, type });
    } catch (error) {
      return errorResponse(error, { exists: false, type: null });
    }
  });

  // Get file/directory stats
  ipcMain.handle('file:stats', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Path not found: ${filePath}`);
      }

      const stats = await fs.stat(filePath);

      return successResponse({
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      });
    } catch (error) {
      return errorResponse(error, { size: 0, isDirectory: false, isFile: false, created: null, modified: null, accessed: null });
    }
  });

  // Select file dialog
  ipcMain.handle('file:select-dialog', async (event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: options.properties || ['openFile'],
        title: options.title || 'Select File',
        filters: options.filters || [],
        defaultPath: options.defaultPath
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return successResponse({ filePaths: result.filePaths, canceled: false });
      }

      return successResponse({ filePaths: [], canceled: true });
    } catch (error) {
      return errorResponse(error, { filePaths: [], canceled: true });
    }
  });

  // Select directory dialog
  ipcMain.handle('file:select-directory', async (event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: options.title || 'Select Directory',
        defaultPath: options.defaultPath
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return successResponse({ path: result.filePaths[0], canceled: false });
      }

      return successResponse({ path: null, canceled: true });
    } catch (error) {
      return errorResponse(error, { path: null, canceled: true });
    }
  });

  // Save file dialog
  ipcMain.handle('file:save-dialog', async (event, options = {}) => {
    try {
      const result = await dialog.showSaveDialog({
        title: options.title || 'Save File',
        defaultPath: options.defaultPath,
        filters: options.filters || []
      });

      if (!result.canceled && result.filePath) {
        return successResponse({ filePath: result.filePath, canceled: false });
      }

      return successResponse({ filePath: null, canceled: true });
    } catch (error) {
      return errorResponse(error, { filePath: null, canceled: true });
    }
  });
}

module.exports = {
  registerFileHandlers
};
