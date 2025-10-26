/**
 * Runner Configuration Schemas
 * Defines the configuration structure for each runner type
 */

export const RUNNER_CONFIGS = {
  csv_reader: {
    type: 'reader',
    displayName: 'CSV Reader',
    description: 'Read CSV files',
    input: {
      path: { type: 'string', required: true, label: 'Directory Path', placeholder: '{DATA_DIR}' },
      files: { type: 'string', required: true, label: 'File Pattern', placeholder: '*.csv' },
      delimiter: { type: 'string', default: ',', label: 'Delimiter', placeholder: ',' },
      has_header: { type: 'boolean', default: true, label: 'Has Header Row' },
      skip_rows: { type: 'number', default: 0, label: 'Skip Rows' },
      encoding: { type: 'string', default: 'utf-8', label: 'Encoding', placeholder: 'utf-8' }
    },
    output: {
      table: { type: 'string', required: true, label: 'Output Table Name' }
    },
    processors: true
  },

  excel_reader: {
    type: 'reader',
    displayName: 'Excel Reader',
    description: 'Read Excel files',
    input: {
      path: { type: 'string', required: true, label: 'Directory Path' },
      files: { type: 'string', required: true, label: 'File Pattern', placeholder: '*.xlsx' },
      sheets: { type: 'array', label: 'Sheet Names (leave empty for all)' },
      skip_rows: { type: 'number', default: 0, label: 'Skip Rows' },
      header_row: { type: 'number', default: 0, label: 'Header Row Index' }
    },
    output: {
      table: { type: 'string', required: true, label: 'Output Table Name' }
    },
    processors: true
  },

  xml_reader: {
    type: 'reader',
    displayName: 'XML Reader',
    description: 'Read XML files',
    input: {
      path: { type: 'string', required: true, label: 'Directory Path' },
      files: { type: 'string', required: true, label: 'File Pattern', placeholder: '*.xml' },
      row_xpath: { type: 'string', required: true, label: 'Row XPath', placeholder: './product' },
      fields: { type: 'object', label: 'Field Mappings (JSON)' }
    },
    output: {
      table: { type: 'string', required: true, label: 'Output Table Name' }
    },
    processors: true
  },

  json_reader: {
    type: 'reader',
    displayName: 'JSON Reader',
    description: 'Read JSON files',
    input: {
      path: { type: 'string', required: true, label: 'Directory Path' },
      files: { type: 'string', required: true, label: 'File Pattern', placeholder: '*.json' }
    },
    output: {
      table: { type: 'string', required: true, label: 'Output Table Name' }
    },
    processors: true
  },

  duckdb_reader: {
    type: 'reader',
    displayName: 'DuckDB Reader',
    description: 'Read from DuckDB database',
    input: {
      db_path: { type: 'string', required: true, label: 'Database Path' },
      table: { type: 'string', label: 'Table Name (use table OR sql)' },
      sql: { type: 'text', label: 'SQL Query (use table OR sql)' }
    },
    output: {
      table: { type: 'string', required: true, label: 'Output Table Name' }
    },
    processors: true
  },

  duckdb_stager: {
    type: 'stager',
    displayName: 'DuckDB Stager',
    description: 'Stage tables to a schema',
    schema: { type: 'string', required: true, label: 'Target Schema', location: 'root' },
    input: {
      tables: { type: 'array', required: true, label: 'Tables to Stage (comma-separated)' }
    },
    output: null,
    processors: false
  },

  sql_transform: {
    type: 'transformer',
    displayName: 'SQL Transform',
    description: 'SQL transformation',
    input: {
      sql: { type: 'text', label: 'Inline SQL (use sql OR sql_file)' },
      sql_file: { type: 'file', label: 'SQL File Path (use sql OR sql_file)', placeholder: 'transforms/sql/clean.sql' }
    },
    output: null,
    processors: false
  },

  python_transform: {
    type: 'transformer',
    displayName: 'Python Transform',
    description: 'Python transformation',
    options: {
      input_tables: {
        type: 'array-complex',
        required: true,
        label: 'Input Tables',
        itemLabel: 'Table',
        fields: {
          schema: { type: 'string', required: true, label: 'Schema' },
          table: { type: 'string', required: true, label: 'Table' },
          alias: { type: 'string', required: true, label: 'Alias (function param name)' }
        }
      },
      python_file: { type: 'file', label: 'Python File (use python_file OR python_code)', placeholder: 'transforms/python/enrich.py' },
      python_code: { type: 'text', label: 'Inline Python (use python_file OR python_code)' },
      output: {
        type: 'array-complex',
        required: true,
        label: 'Output Tables',
        itemLabel: 'Output',
        fields: {
          table: { type: 'string', required: true, label: 'Table Name' },
          schema: { type: 'string', required: true, label: 'Schema' },
          source_df: { type: 'string', required: true, label: 'Source DataFrame (return dict key)' },
          mode: { type: 'select', options: ['replace', 'append'], default: 'replace', label: 'Write Mode' }
        }
      }
    },
    processors: true
  },

  csv_writer: {
    type: 'writer',
    displayName: 'CSV Writer',
    description: 'Write to CSV files',
    input: {
      schema: { type: 'string', required: true, label: 'Schema' },
      table: { type: 'string', required: true, label: 'Table' }
    },
    output: {
      path: { type: 'string', required: true, label: 'Output Directory' },
      filename: { type: 'string', required: true, label: 'Filename' }
    },
    processors: false
  },

  excel_writer: {
    type: 'writer',
    displayName: 'Excel Writer',
    description: 'Write to Excel files',
    input: {
      schema: { type: 'string', required: true, label: 'Schema' },
      table: { type: 'string', required: true, label: 'Table' }
    },
    output: {
      path: { type: 'string', required: true, label: 'Output Directory' },
      filename: { type: 'string', required: true, label: 'Filename' }
    },
    processors: false
  }
};

/**
 * Get list of all available runners grouped by type
 */
export function getRunnersByType() {
  const grouped = {
    readers: [],
    stagers: [],
    transformers: [],
    writers: []
  };

  Object.entries(RUNNER_CONFIGS).forEach(([key, config]) => {
    const item = { key, ...config };

    switch (config.type) {
      case 'reader':
        grouped.readers.push(item);
        break;
      case 'stager':
        grouped.stagers.push(item);
        break;
      case 'transformer':
        grouped.transformers.push(item);
        break;
      case 'writer':
        grouped.writers.push(item);
        break;
    }
  });

  return grouped;
}

/**
 * Get runner configuration by key
 */
export function getRunnerConfig(runnerKey) {
  return RUNNER_CONFIGS[runnerKey] || null;
}

/**
 * Available processors
 */
export const PROCESSORS = {
  normalize_headers: {
    name: 'normalize_headers',
    displayName: 'Normalize Headers',
    description: 'Normalize column names to lowercase with underscores'
  },
  drop_empty_rows: {
    name: 'drop_empty_rows',
    displayName: 'Drop Empty Rows',
    description: 'Remove rows where all values are null'
  },
  fill_merged_cells: {
    name: 'fill_merged_cells',
    displayName: 'Fill Merged Cells',
    description: 'Fill merged cells in Excel files'
  },
  type_cast: {
    name: 'type_cast',
    displayName: 'Type Cast',
    description: 'Cast columns to specific types',
    hasConfig: true,
    configFields: {
      type_cast: { type: 'object', label: 'Column Type Mappings (JSON)' }
    }
  }
};
