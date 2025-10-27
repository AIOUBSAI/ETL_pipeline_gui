const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { getSettings } = require('../utils/settings');
const { assertFileExists } = require('../utils/validation');

/**
 * Execute a command and return output
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {string} cwd - Working directory
 * @returns {Promise} Promise resolving to command output
 */
function executeCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      cwd,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Parse DuckDB schema output into structured format
 * @param {string} output - DuckDB command output
 * @returns {Object} Parsed schema information
 */
function parseDuckDBSchema(output) {
  const schemas = {};
  const lines = output.split('\n').filter(l => l.trim());

  lines.forEach(line => {
    // Parse schema.table format
    const match = line.match(/^(\w+)\.(\w+)/);
    if (match) {
      const [, schema, table] = match;
      if (!schemas[schema]) {
        schemas[schema] = [];
      }
      if (!schemas[schema].includes(table)) {
        schemas[schema].push(table);
      }
    } else {
      // Handle tables without schema (main schema)
      const tableName = line.trim();
      if (tableName && !tableName.includes('(')) {
        if (!schemas.main) {
          schemas.main = [];
        }
        if (!schemas.main.includes(tableName)) {
          schemas.main.push(tableName);
        }
      }
    }
  });

  return schemas;
}

/**
 * Parse SQLite schema output
 * @param {string} output - SQLite command output
 * @returns {Object} Parsed schema information
 */
function parseSQLiteSchema(output) {
  const schemas = { main: [] };
  const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('sqlite>'));

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.includes('|') && !trimmed.includes('=')) {
      schemas.main.push(trimmed);
    }
  });

  return schemas;
}

/**
 * Register database IPC handlers
 */
function registerDatabaseHandlers() {
  // Get database schema information
  ipcMain.handle('database:get-schema', async (event, dbPath) => {
    try {
      assertFileExists(dbPath, 'Database file');

      const ext = path.extname(dbPath).toLowerCase();
      const isDuckDB = ext === '.duckdb' || ext === '.db';
      const isSQLite = ext === '.sqlite' || ext === '.sqlite3';

      if (!isDuckDB && !isSQLite) {
        throw new Error('Unsupported database type. Only .duckdb and .sqlite files are supported.');
      }

      let schemas = {};
      let tables = [];

      if (isDuckDB) {
        // Use DuckDB CLI to get schema
        try {
          const output = await executeCommand(
            'duckdb',
            [dbPath, '-c', 'SHOW ALL TABLES;'],
            path.dirname(dbPath)
          );
          schemas = parseDuckDBSchema(output);
        } catch (error) {
          // Fallback: try to use Python with DuckDB
          const settings = getSettings();
          const pythonPath = settings.pythonPath || 'python';

          const pythonScript = `
import duckdb
import json

conn = duckdb.connect('${dbPath.replace(/\\/g, '\\\\')}')
schemas = {}

# Get all schemas
try:
    schema_result = conn.execute("SELECT DISTINCT schema_name FROM information_schema.schemata").fetchall()
    for (schema_name,) in schema_result:
        schemas[schema_name] = []

        # Get tables in this schema
        tables_result = conn.execute(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{schema_name}'").fetchall()
        for (table_name,) in tables_result:
            schemas[schema_name].append(table_name)
except:
    # Fallback: use SHOW TABLES
    result = conn.execute("SHOW ALL TABLES").fetchall()
    for row in result:
        if len(row) >= 2:
            schema_name = row[0]
            table_name = row[1]
            if schema_name not in schemas:
                schemas[schema_name] = []
            schemas[schema_name].append(table_name)

conn.close()
print(json.dumps(schemas))
`;

          const tempScript = path.join(require('os').tmpdir(), `duckdb_schema_${Date.now()}.py`);
          await fs.writeFile(tempScript, pythonScript);

          try {
            const output = await executeCommand(pythonPath, [tempScript], path.dirname(dbPath));
            schemas = JSON.parse(output.trim());
          } finally {
            await fs.remove(tempScript);
          }
        }
      } else if (isSQLite) {
        // Use SQLite CLI
        const output = await executeCommand(
          'sqlite3',
          [dbPath, '.tables'],
          path.dirname(dbPath)
        );
        schemas = parseSQLiteSchema(output);
      }

      // Flatten schemas to get all tables
      Object.values(schemas).forEach(schemaTables => {
        tables.push(...schemaTables);
      });

      return {
        success: true,
        type: isDuckDB ? 'duckdb' : 'sqlite',
        schemas,
        tables
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Execute SQL query
  ipcMain.handle('database:query', async (event, dbPath, sql, options = {}) => {
    try {
      assertFileExists(dbPath, 'Database file');

      const ext = path.extname(dbPath).toLowerCase();
      const isDuckDB = ext === '.duckdb' || ext === '.db';
      const isSQLite = ext === '.sqlite' || ext === '.sqlite3';

      // Apply row limit for safety
      const maxRows = options.maxRows || 10000;
      const limitedSql = sql.trim().toLowerCase().includes('limit')
        ? sql
        : `${sql.trim().replace(/;$/, '')} LIMIT ${maxRows}`;

      const settings = getSettings();
      const pythonPath = settings.pythonPath || 'python';

      // Use Python to execute query and return JSON
      const pythonScript = `
import ${isDuckDB ? 'duckdb' : 'sqlite3'} as db
import json
import sys
from datetime import datetime, date
from decimal import Decimal

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        elif isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, bytes):
            return obj.decode('utf-8', errors='ignore')
        return super().default(obj)

try:
    conn = db.connect('${dbPath.replace(/\\/g, '\\\\')}')
    cursor = conn.cursor()

    start_time = datetime.now()
    cursor.execute("""${sql.replace(/"/g, '\\"')}""")

    # Get column names
    columns = [desc[0] for desc in cursor.description] if cursor.description else []

    # Fetch rows
    rows = cursor.fetchall()

    # Convert rows to list of dicts
    data = []
    for row in rows:
        data.append(list(row))

    duration = (datetime.now() - start_time).total_seconds()

    result = {
        "success": True,
        "columns": columns,
        "rows": data,
        "rowCount": len(data),
        "duration": duration
    }

    print(json.dumps(result, cls=CustomJSONEncoder))

    conn.close()

except Exception as e:
    error_result = {
        "success": False,
        "error": str(e)
    }
    print(json.dumps(error_result))
    sys.exit(1)
`;

      const tempScript = path.join(require('os').tmpdir(), `db_query_${Date.now()}.py`);
      await fs.writeFile(tempScript, pythonScript);

      try {
        const output = await executeCommand(pythonPath, [tempScript], path.dirname(dbPath));
        const result = JSON.parse(output.trim());

        await fs.remove(tempScript);

        if (result.success) {
          return {
            success: true,
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rowCount,
            duration: result.duration
          };
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        await fs.remove(tempScript);
        throw error;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Export table to CSV/JSON
  ipcMain.handle('database:export-table', async (event, dbPath, tableName, format = 'csv') => {
    try {
      assertFileExists(dbPath, 'Database file');

      const settings = getSettings();
      const pythonPath = settings.pythonPath || 'python';
      const ext = path.extname(dbPath).toLowerCase();
      const isDuckDB = ext === '.duckdb' || ext === '.db';

      // Generate output filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFilename = `${tableName}_${timestamp}.${format}`;
      const outputPath = path.join(require('os').tmpdir(), outputFilename);

      const pythonScript = `
import ${isDuckDB ? 'duckdb' : 'sqlite3'} as db
import ${format === 'json' ? 'json' : 'csv'}
import sys

try:
    conn = db.connect('${dbPath.replace(/\\/g, '\\\\')}')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ${tableName}")

    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]

    ${format === 'csv' ? `
    import csv
    with open('${outputPath.replace(/\\/g, '\\\\')}', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        writer.writerows(rows)
    ` : `
    data = [dict(zip(columns, row)) for row in rows]
    with open('${outputPath.replace(/\\/g, '\\\\')}', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)
    `}

    print('${outputPath.replace(/\\/g, '\\\\')}')
    conn.close()

except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;

      const tempScript = path.join(require('os').tmpdir(), `db_export_${Date.now()}.py`);
      await fs.writeFile(tempScript, pythonScript);

      try {
        await executeCommand(pythonPath, [tempScript], path.dirname(dbPath));
        await fs.remove(tempScript);

        return {
          success: true,
          outputPath,
          filename: outputFilename
        };
      } catch (error) {
        await fs.remove(tempScript);
        throw error;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get table column information
  ipcMain.handle('database:get-table-info', async (event, dbPath, tableName) => {
    try {
      assertFileExists(dbPath, 'Database file');

      const settings = getSettings();
      const pythonPath = settings.pythonPath || 'python';
      const ext = path.extname(dbPath).toLowerCase();
      const isDuckDB = ext === '.duckdb' || ext === '.db';

      const pythonScript = `
import ${isDuckDB ? 'duckdb' : 'sqlite3'} as db
import json

try:
    conn = db.connect('${dbPath.replace(/\\/g, '\\\\')}')
    cursor = conn.cursor()

    # Get column information
    ${isDuckDB ? `
    cursor.execute(f"DESCRIBE ${tableName}")
    ` : `
    cursor.execute(f"PRAGMA table_info(${tableName})")
    `}

    columns_info = cursor.fetchall()

    # Get row count
    cursor.execute(f"SELECT COUNT(*) FROM ${tableName}")
    row_count = cursor.fetchone()[0]

    result = {
        "success": True,
        "columns": [{"name": col[${isDuckDB ? '0' : '1'}], "type": col[${isDuckDB ? '1' : '2'}]} for col in columns_info],
        "rowCount": row_count
    }

    print(json.dumps(result))
    conn.close()

except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

      const tempScript = path.join(require('os').tmpdir(), `db_table_info_${Date.now()}.py`);
      await fs.writeFile(tempScript, pythonScript);

      try {
        const output = await executeCommand(pythonPath, [tempScript], path.dirname(dbPath));
        const result = JSON.parse(output.trim());

        await fs.remove(tempScript);

        return result;
      } catch (error) {
        await fs.remove(tempScript);
        throw error;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerDatabaseHandlers
};
