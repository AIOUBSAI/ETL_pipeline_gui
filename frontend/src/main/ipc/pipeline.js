const { ipcMain, dialog } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { sendToRenderer } = require('../window');
const { getSettings } = require('../utils/settings');

// Store running pipeline processes
const runningPipelines = new Map();

/**
 * Map Python logging levels to app log types
 * @param {string} pythonLevel - Python log level
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
 * Register pipeline management IPC handlers
 */
function registerPipelineHandlers() {
  // List all pipeline YAML files in a directory
  ipcMain.handle('pipeline:list', async (event, directory) => {
    try {
      const settings = getSettings();
      const baseDir = directory || settings.pipelineConfigPath || settings.etlBackendPath;

      if (!baseDir) {
        return { success: false, error: 'Pipeline directory not configured in settings', pipelines: [] };
      }

      // Look for pipeline.yaml files in the directory and subdirectories
      const pipelines = [];

      const scanDirectory = (dir) => {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        entries.forEach(entry => {
          const fullPath = path.join(dir, entry.name);

          if (entry.isFile() && (
            entry.name === 'pipeline.yaml' ||
            entry.name.endsWith('_pipeline.yaml') ||
            entry.name.startsWith('pipeline_')
          ) && entry.name.endsWith('.yaml')) {
            const stats = fs.statSync(fullPath);
            pipelines.push({
              name: entry.name,
              path: fullPath,
              directory: dir,
              lastModified: stats.mtime,
              size: stats.size
            });
          } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            // Recursively scan subdirectories (max depth 2)
            const depth = fullPath.split(path.sep).length - baseDir.split(path.sep).length;
            if (depth < 3) {
              scanDirectory(fullPath);
            }
          }
        });
      };

      scanDirectory(baseDir);

      // Sort by last modified (newest first)
      pipelines.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      return { success: true, pipelines };
    } catch (error) {
      return { success: false, error: error.message, pipelines: [] };
    }
  });

  // Read pipeline YAML file content
  ipcMain.handle('pipeline:read', async (event, pipelinePath) => {
    try {
      if (!fs.existsSync(pipelinePath)) {
        throw new Error(`Pipeline file not found: ${pipelinePath}`);
      }

      const content = await fs.readFile(pipelinePath, 'utf-8');
      return { success: true, content, path: pipelinePath };
    } catch (error) {
      return { success: false, error: error.message, content: '' };
    }
  });

  // Write pipeline YAML file (with backup)
  ipcMain.handle('pipeline:write', async (event, pipelinePath, content) => {
    try {
      // Create backup before writing
      if (fs.existsSync(pipelinePath)) {
        const backupPath = `${pipelinePath}.backup.${Date.now()}`;
        await fs.copyFile(pipelinePath, backupPath);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(pipelinePath));

      // Write the file
      await fs.writeFile(pipelinePath, content, 'utf-8');

      return { success: true, path: pipelinePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Validate pipeline configuration
  ipcMain.handle('pipeline:validate', async (event, pipelinePath) => {
    try {
      const settings = getSettings();
      const backendPath = settings.etlBackendPath;

      if (!backendPath) {
        throw new Error('ETL Backend Path not configured in settings');
      }

      if (!fs.existsSync(pipelinePath)) {
        throw new Error(`Pipeline file not found: ${pipelinePath}`);
      }

      // Run validation command
      const pythonPath = settings.pythonPath || 'python';
      const args = [
        '-m', 'pipeline.cli',
        '--pipeline', pipelinePath,
        '--validate'
      ];

      return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, args, {
          cwd: backendPath,
          shell: true
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              valid: true,
              output,
              errors: [],
              warnings: []
            });
          } else {
            // Parse validation errors from output
            const errors = [];
            const warnings = [];

            // Try to extract structured errors from output
            const lines = (output + errorOutput).split('\n');
            lines.forEach(line => {
              if (line.includes('ERROR') || line.includes('Error')) {
                errors.push(line.trim());
              } else if (line.includes('WARNING') || line.includes('Warning')) {
                warnings.push(line.trim());
              }
            });

            resolve({
              success: true,
              valid: false,
              output: output + errorOutput,
              errors,
              warnings
            });
          }
        });

        pythonProcess.on('error', (error) => {
          reject({ success: false, error: error.message });
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Execute pipeline
  ipcMain.handle('pipeline:execute', async (event, pipelinePath, options = {}) => {
    try {
      const settings = getSettings();
      const backendPath = settings.etlBackendPath;

      if (!backendPath) {
        throw new Error('ETL Backend Path not configured in settings');
      }

      if (!fs.existsSync(pipelinePath)) {
        throw new Error(`Pipeline file not found: ${pipelinePath}`);
      }

      const pythonPath = settings.pythonPath || 'python';
      const args = [
        '-m', 'pipeline.cli',
        '--pipeline', pipelinePath
      ];

      // Add options
      if (options.validate) args.push('--validate');
      if (options.dryRun) args.push('--dry-run');
      if (options.json) args.push('--json');
      if (options.logLevel) args.push('--log-level', options.logLevel);

      const pythonProcess = spawn(pythonPath, args, {
        cwd: backendPath,
        shell: true
      });

      // Generate unique process ID
      const processId = `pipeline_${Date.now()}`;
      runningPipelines.set(processId, {
        process: pythonProcess,
        pipelinePath,
        startTime: Date.now()
      });

      // Stream output to renderer
      pythonProcess.stdout.on('data', (data) => {
        const message = data.toString();
        const lines = message.split('\n').filter(line => line.trim());

        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // Try to parse as JSON
          let logEntry = null;
          try {
            const parsed = JSON.parse(trimmedLine);
            if (parsed.level && parsed.message) {
              logEntry = {
                type: mapPythonLogLevel(parsed.level),
                message: parsed.message,
                timestamp: parsed.timestamp || new Date().toISOString(),
                ...parsed // Include any additional fields (job_name, stage, etc.)
              };
            }
          } catch (e) {
            // Not JSON, treat as plain text
            logEntry = {
              type: 'info',
              message: trimmedLine,
              timestamp: new Date().toISOString()
            };
          }

          if (logEntry) {
            sendToRenderer('pipeline:output', { processId, log: logEntry });
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        const message = data.toString();
        const lines = message.split('\n').filter(line => line.trim());

        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          sendToRenderer('pipeline:output', {
            processId,
            log: {
              type: 'error',
              message: trimmedLine,
              timestamp: new Date().toISOString()
            }
          });
        });
      });

      pythonProcess.on('close', (code) => {
        const pipelineData = runningPipelines.get(processId);
        const duration = pipelineData ? Date.now() - pipelineData.startTime : 0;

        runningPipelines.delete(processId);

        sendToRenderer('pipeline:complete', {
          processId,
          success: code === 0,
          exitCode: code,
          duration
        });
      });

      pythonProcess.on('error', (error) => {
        runningPipelines.delete(processId);

        sendToRenderer('pipeline:error', {
          processId,
          error: error.message
        });
      });

      return { success: true, processId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Stop running pipeline
  ipcMain.handle('pipeline:stop', async (event, processId) => {
    try {
      const pipelineData = runningPipelines.get(processId);

      if (!pipelineData) {
        return { success: false, error: 'Pipeline process not found' };
      }

      pipelineData.process.kill('SIGTERM');
      runningPipelines.delete(processId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // List HTML reports
  ipcMain.handle('pipeline:list-reports', async (event, reportsDir) => {
    try {
      const settings = getSettings();
      const baseDir = reportsDir || settings.reportsPath || path.join(settings.etlBackendPath || '', 'reports');

      if (!fs.existsSync(baseDir)) {
        return { success: true, reports: [] };
      }

      const reports = [];
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });

      entries.forEach(entry => {
        if (entry.isFile() && entry.name.endsWith('.html')) {
          const fullPath = path.join(baseDir, entry.name);
          const stats = fs.statSync(fullPath);

          reports.push({
            name: entry.name,
            path: fullPath,
            date: stats.mtime,
            size: stats.size
          });
        }
      });

      // Sort by date (newest first)
      reports.sort((a, b) => b.date.getTime() - a.date.getTime());

      return { success: true, reports };
    } catch (error) {
      return { success: false, error: error.message, reports: [] };
    }
  });

  // Read HTML report
  ipcMain.handle('pipeline:read-report', async (event, reportPath) => {
    try {
      if (!fs.existsSync(reportPath)) {
        throw new Error(`Report file not found: ${reportPath}`);
      }

      const content = await fs.readFile(reportPath, 'utf-8');
      return { success: true, content, path: reportPath };
    } catch (error) {
      return { success: false, error: error.message, content: '' };
    }
  });
}

module.exports = {
  registerPipelineHandlers
};
