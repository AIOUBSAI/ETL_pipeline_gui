const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sendToRenderer } = require('../window');
const { getSettings } = require('../utils/settings');
const { sendNotification } = require('./notifications');

// Store running processes
const runningProcesses = new Map();

// Store process start times
const processStartTimes = new Map();

/**
 * Map Python logging levels to app log types
 * @param {string} pythonLevel - Python log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
 * @returns {string} App log type
 */
function mapPythonLogLevel(pythonLevel) {
  const level = pythonLevel.toUpperCase();

  switch (level) {
    case 'DEBUG':
      return 'info';
    case 'INFO':
      return 'info';
    case 'WARNING':
    case 'WARN':
      return 'warning';
    case 'ERROR':
      return 'error';
    case 'CRITICAL':
    case 'FATAL':
      return 'error';
    case 'SUCCESS':
      return 'success';
    default:
      return 'info';
  }
}

/**
 * Register project management IPC handlers
 */
function registerProjectHandlers() {
  // Select root folder
  ipcMain.handle('select-root-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Root Projects Folder'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // Scan for project folders
  ipcMain.handle('scan-projects', async (event, rootFolder) => {
    try {
      if (!fs.existsSync(rootFolder)) {
        throw new Error('Root folder does not exist');
      }

      const entries = fs.readdirSync(rootFolder, { withFileTypes: true });
      const projects = entries
        .filter(entry => entry.isDirectory())
        .map(entry => ({
          name: entry.name,
          path: path.join(rootFolder, entry.name),
          lastModified: fs.statSync(path.join(rootFolder, entry.name)).mtime
        }))
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      return projects;
    } catch (error) {
      throw error;
    }
  });

  // Run Python script
  ipcMain.handle('run-python-script', async (event, projectName, projectPath) => {
    return new Promise((resolve, reject) => {
      const settings = getSettings();

      // Validate ETL project path from settings
      if (!settings.etlProjectPath) {
        const errorMsg = 'ETL Project Path not configured in settings. Please set it in Settings > General';
        sendToRenderer('log-message', {
          type: 'error',
          message: errorMsg,
          timestamp: new Date().toISOString()
        });
        reject({ success: false, error: errorMsg });
        return;
      }

      // Send log message
      sendToRenderer('log-message', {
        type: 'info',
        message: `Starting pipeline for project: ${projectName}`,
        timestamp: new Date().toISOString()
      });

      // Build command: cd to ETL project directory, activate venv, then run pipeline
      // The pipeline YAML is inside the ETL project at config/pipeline_duckdb.yaml
      const command = `cd /d "${settings.etlProjectPath}" && .venv\\Scripts\\activate && python -m pipeline.cli --pipeline config/pipeline_duckdb.yaml --dotenv .env --log-level user`;

      sendToRenderer('log-message', {
        type: 'info',
        message: `Executing in ${settings.etlProjectPath}`,
        timestamp: new Date().toISOString()
      });

      sendToRenderer('log-message', {
        type: 'info',
        message: `Activating .venv and running pipeline...`,
        timestamp: new Date().toISOString()
      });

      // Spawn with shell to support cd command
      const pythonProcess = spawn(command, [], {
        shell: true,
        cwd: settings.etlProjectPath // Set working directory to ETL project path
      });

      // Store the process and start time
      runningProcesses.set(projectName, pythonProcess);
      processStartTimes.set(projectName, Date.now());

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;

        // Parse each line separately (handle multiple lines in one data chunk)
        const lines = message.split('\n').filter(line => line.trim());

        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // Try to parse as JSON
          let logEntry = null;
          try {
            const parsed = JSON.parse(trimmedLine);
            // Validate it's a log object with required fields
            if (parsed.level && parsed.message) {
              logEntry = {
                type: mapPythonLogLevel(parsed.level),
                message: parsed.message,
                timestamp: parsed.timestamp || new Date().toISOString()
              };
            }
          } catch (e) {
            // Not JSON, treat as plain text info log
            logEntry = {
              type: 'info',
              message: trimmedLine,
              timestamp: new Date().toISOString()
            };
          }

          if (logEntry) {
            sendToRenderer('log-message', logEntry);
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;

        // Parse each line separately (handle multiple lines in one data chunk)
        const lines = message.split('\n').filter(line => line.trim());

        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // Try to parse as JSON
          let logEntry = null;
          try {
            const parsed = JSON.parse(trimmedLine);
            // Validate it's a log object with required fields
            if (parsed.level && parsed.message) {
              logEntry = {
                type: mapPythonLogLevel(parsed.level),
                message: parsed.message,
                timestamp: parsed.timestamp || new Date().toISOString()
              };
            }
          } catch (e) {
            // Not JSON, treat as plain text error log
            logEntry = {
              type: 'error',
              message: trimmedLine,
              timestamp: new Date().toISOString()
            };
          }

          if (logEntry) {
            sendToRenderer('log-message', logEntry);
          }
        });
      });

      pythonProcess.on('close', (code) => {
        // Calculate execution duration
        const startTime = processStartTimes.get(projectName);
        const duration = startTime ? Date.now() - startTime : 0;

        // Remove from running processes
        runningProcesses.delete(projectName);
        processStartTimes.delete(projectName);

        sendToRenderer('log-message', {
          type: code === 0 ? 'success' : 'error',
          message: `Process exited with code ${code}`,
          timestamp: new Date().toISOString()
        });

        // Send notification
        sendNotification({
          title: code === 0 ? 'Script Completed' : 'Script Failed',
          body: code === 0
            ? `${projectName} finished successfully in ${(duration / 1000).toFixed(1)}s`
            : `${projectName} exited with code ${code}`,
          type: code === 0 ? 'success' : 'error',
          projectName,
          success: code === 0,
          duration,
          exitCode: code
        });

        if (code === 0) {
          resolve({ success: true, output, code });
        } else {
          reject({ success: false, error: errorOutput, code });
        }
      });

      pythonProcess.on('error', (error) => {
        runningProcesses.delete(projectName);

        sendToRenderer('log-message', {
          type: 'error',
          message: `Failed to start Python process: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        reject({ success: false, error: error.message });
      });
    });
  });

  // Stop/kill a running project
  ipcMain.handle('stop-project', async (event, projectName) => {
    const process = runningProcesses.get(projectName);

    if (!process) {
      return { success: false, error: 'Process not found' };
    }

    try {
      process.kill('SIGTERM');
      runningProcesses.delete(projectName);
      processStartTimes.delete(projectName);

      sendToRenderer('log-message', {
        type: 'info',
        message: `Stopped project: ${projectName}`,
        timestamp: new Date().toISOString()
      });

      // Send notification for manual stop
      sendNotification({
        title: 'Script Stopped',
        body: `${projectName} was stopped manually`,
        type: 'info',
        projectName
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerProjectHandlers
};
