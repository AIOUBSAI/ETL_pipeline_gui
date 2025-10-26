/**
 * YAML Utilities
 * Wrapper around js-yaml for pipeline config parsing
 */

// Note: js-yaml is a Node.js module, so we'll use a simple approach here
// In production, you'd bundle js-yaml with webpack or use a browser-compatible version

/**
 * Parse YAML string to object
 * @param {string} yamlString - YAML content
 * @returns {object} Parsed config
 */
export function parseYAML(yamlString) {
  // For Phase 2, we'll use a simple parser
  // In Phase 6, integrate proper js-yaml library via bundler

  const config = {
    pipeline: { name: '', version: '1.0', description: '' },
    variables: {},
    databases: { warehouse: { type: 'duckdb', path: '', schemas: [] } },
    stages: [],
    jobs: {}
  };

  try {
    const lines = yamlString.split('\n');
    let currentSection = null;
    let currentJob = null;
    let indent = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Top-level sections
      if (trimmed === 'pipeline:') currentSection = 'pipeline';
      else if (trimmed === 'variables:') currentSection = 'variables';
      else if (trimmed === 'databases:') currentSection = 'databases';
      else if (trimmed === 'stages:') currentSection = 'stages';
      else if (trimmed === 'jobs:') currentSection = 'jobs';

      // Parse based on section
      else if (currentSection === 'pipeline') {
        const match = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
        if (match) {
          config.pipeline[match[1]] = match[2];
        }
      } else if (currentSection === 'variables') {
        const match = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
        if (match) {
          config.variables[match[1]] = match[2];
        }
      } else if (currentSection === 'stages') {
        if (trimmed.startsWith('- ')) {
          config.stages.push(trimmed.substring(2).trim());
        }
      }
    }

    return config;
  } catch (error) {
    console.error('YAML parse error:', error);
    return config;
  }
}

/**
 * Convert config object to YAML string
 * @param {object} config - Pipeline config
 * @returns {string} YAML string
 */
export function stringifyYAML(config) {
  let yaml = '';

  // Pipeline metadata
  yaml += 'pipeline:\n';
  if (config.pipeline) {
    yaml += `  name: "${config.pipeline.name || 'Untitled'}"\n`;
    yaml += `  version: "${config.pipeline.version || '1.0'}"\n`;
    if (config.pipeline.description) {
      yaml += `  description: "${config.pipeline.description}"\n`;
    }
  }

  // Variables
  yaml += '\nvariables:\n';
  if (config.variables && Object.keys(config.variables).length > 0) {
    Object.entries(config.variables).forEach(([key, value]) => {
      yaml += `  ${key}: "${value}"\n`;
    });
  } else {
    yaml += '  DATA_DIR: "data"\n';
  }

  // Databases
  yaml += '\ndatabases:\n';
  yaml += '  warehouse:\n';
  const db = config.databases?.warehouse || {};
  yaml += `    type: ${db.type || 'duckdb'}\n`;
  yaml += `    path: "${db.path || 'out/db/warehouse.duckdb'}"\n`;
  yaml += `    reset_on_start: ${db.reset_on_start || false}\n`;
  yaml += '    schemas:\n';
  const schemas = db.schemas || ['landing', 'staging', 'analytics'];
  schemas.forEach(schema => {
    yaml += `      - ${schema}\n`;
  });

  // Stages
  yaml += '\nstages:\n';
  const stages = config.stages || ['extract', 'stage', 'transform', 'export'];
  stages.forEach(stage => {
    yaml += `  - ${stage}\n`;
  });

  // Jobs
  yaml += '\njobs:\n';
  const jobs = config.jobs || {};

  if (Object.keys(jobs).length === 0) {
    yaml += '  {}\n';
  } else {
    Object.entries(jobs).forEach(([jobName, job]) => {
      yaml += `  ${jobName}:\n`;
      yaml += `    stage: ${job.stage}\n`;
      yaml += `    runner: ${job.runner}\n`;

      // Schema (for stagers)
      if (job.schema) {
        yaml += `    schema: "${job.schema}"\n`;
      }

      // Dependencies
      if (job.depends_on && job.depends_on.length > 0) {
        yaml += '    depends_on:\n';
        job.depends_on.forEach(dep => {
          yaml += `      - ${dep}\n`;
        });
      } else {
        yaml += '    depends_on: []\n';
      }

      // Input
      if (job.input && Object.keys(job.input).length > 0) {
        yaml += '    input:\n';
        Object.entries(job.input).forEach(([key, value]) => {
          if (typeof value === 'string') {
            yaml += `      ${key}: "${value}"\n`;
          } else if (typeof value === 'boolean') {
            yaml += `      ${key}: ${value}\n`;
          } else if (typeof value === 'number') {
            yaml += `      ${key}: ${value}\n`;
          } else if (Array.isArray(value)) {
            if (value.length > 0) {
              yaml += `      ${key}:\n`;
              value.forEach(item => {
                yaml += `        - ${item}\n`;
              });
            }
          } else if (typeof value === 'object') {
            yaml += `      ${key}:\n`;
            Object.entries(value).forEach(([k, v]) => {
              yaml += `        ${k}: "${v}"\n`;
            });
          }
        });
      }

      // Output
      if (job.output && Object.keys(job.output).length > 0) {
        yaml += '    output:\n';
        Object.entries(job.output).forEach(([key, value]) => {
          yaml += `      ${key}: "${value}"\n`;
        });
      }

      // Processors
      if (job.processors && job.processors.length > 0) {
        yaml += '    processors:\n';
        job.processors.forEach(proc => {
          if (typeof proc === 'string') {
            yaml += `      - ${proc}\n`;
          } else {
            yaml += `      - name: ${proc.name}\n`;
            if (proc.config) {
              Object.entries(proc.config).forEach(([key, value]) => {
                yaml += `        ${key}: ${JSON.stringify(value)}\n`;
              });
            }
          }
        });
      }

      yaml += '\n';
    });
  }

  return yaml;
}
