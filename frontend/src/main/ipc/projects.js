const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sendToRenderer } = require('../window');
const { getSettings } = require('../utils/settings');
const { sendNotification } = require('./notifications');
const { ProcessOutputParser } = require('../utils/process-parser');
const { successResponse, errorResponse } = require('../utils/ipc-response');

// Store running processes
const runningProcesses = new Map();

// Store process start times
const processStartTimes = new Map();

/**
 * Register project management IPC handlers
 */
function registerProjectHandlers() {
  // Select root folder
  ipcMain.handle('select-root-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Root Projects Folder'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return successResponse({ path: result.filePaths[0] });
      }
      return successResponse({ path: null });
    } catch (error) {
      return errorResponse(error, { path: null });
    }
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

      return successResponse({ projects });
    } catch (error) {
      return errorResponse(error, { projects: [] });
    }
  });

  // Run Python script
  ipcMain.handle('run-python-script', async (event, projectName, projectPath) => {
    return new Promise((resolve, reject) => {
      const settings = getSettings();

      // Validate ETL project path from settings
      if (!settings.etlProjectPath) {
        const errorMsg = 'ETL Project Path not configured in settings. Please set it in Settings > General';
        sendToRenderer('log-message',
          ProcessOutputParser.createLogEntry(errorMsg, 'error')
        );
        reject(errorResponse(errorMsg, { output: '', code: null }));
        return;
      }

      // Send log messages
      sendToRenderer('log-message',
        ProcessOutputParser.createLogEntry(`Starting pipeline for project: ${projectName}`, 'info')
      );

      // Build command: cd to ETL project directory, activate venv, then run pipeline
      // The pipeline YAML is inside the ETL project at config/pipeline_duckdb.yaml
      const command = `cd /d "${settings.etlProjectPath}" && .venv\\Scripts\\activate && python -m pipeline.cli --pipeline config/pipeline_duckdb.yaml --dotenv .env --log-level user`;

      sendToRenderer('log-message',
        ProcessOutputParser.createLogEntry(`Executing in ${settings.etlProjectPath}`, 'info')
      );

      sendToRenderer('log-message',
        ProcessOutputParser.createLogEntry('Activating .venv and running pipeline...', 'info')
      );

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
        output += data.toString();

        // Parse and send to renderer
        ProcessOutputParser.parseStdout(data, (logEntry) => {
          sendToRenderer('log-message', logEntry);
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();

        // Parse and send to renderer
        ProcessOutputParser.parseStderr(data, (logEntry) => {
          sendToRenderer('log-message', logEntry);
        });
      });

      pythonProcess.on('close', (code) => {
        // Calculate execution duration
        const startTime = processStartTimes.get(projectName);
        const duration = startTime ? Date.now() - startTime : 0;

        // Remove from running processes
        runningProcesses.delete(projectName);
        processStartTimes.delete(projectName);

        sendToRenderer('log-message',
          ProcessOutputParser.createLogEntry(
            `Process exited with code ${code}`,
            code === 0 ? 'success' : 'error'
          )
        );

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
          resolve(successResponse({ output, code }));
        } else {
          reject(errorResponse(errorOutput || `Process exited with code ${code}`, { output: '', code }));
        }
      });

      pythonProcess.on('error', (error) => {
        runningProcesses.delete(projectName);

        sendToRenderer('log-message',
          ProcessOutputParser.createLogEntry(
            `Failed to start Python process: ${error.message}`,
            'error'
          )
        );
        reject(errorResponse(error, { output: '', code: null }));
      });
    });
  });

  // Stop/kill a running project
  ipcMain.handle('stop-project', async (event, projectName) => {
    try {
      const process = runningProcesses.get(projectName);

      if (!process) {
        throw new Error('Process not found');
      }

      process.kill('SIGTERM');
      runningProcesses.delete(projectName);
      processStartTimes.delete(projectName);

      sendToRenderer('log-message',
        ProcessOutputParser.createLogEntry(`Stopped project: ${projectName}`, 'info')
      );

      // Send notification for manual stop
      sendNotification({
        title: 'Script Stopped',
        body: `${projectName} was stopped manually`,
        type: 'info',
        projectName
      });

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}

module.exports = {
  registerProjectHandlers
};
