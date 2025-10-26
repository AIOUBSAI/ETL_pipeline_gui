"""
SQL Transform Runner - Helper for executing YAML-defined SQL transformations

This is NOT a processor - it's a helper class used by the orchestrator to execute
multi-step SQL transformation workflows defined in YAML files.

Used by transform stage jobs with runner: sql_transform and sql_file: path/to/transforms.yaml
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

from pipeline.common.logger import get_logger

log = get_logger()


class YamlSqlTransform:
    """Parse and execute SQL transformations from YAML files"""

    def __init__(self, yaml_path: Path):
        self.yaml_path = yaml_path
        self.metadata: Dict[str, Any] = {}
        self.transformations: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        """Load and parse YAML file"""
        if not self.yaml_path.exists():
            raise FileNotFoundError(f"Transformation file not found: {self.yaml_path}")

        try:
            with open(self.yaml_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)

            self.metadata = data.get('metadata', {})
            self.transformations = data.get('transformations', [])

            log.debug(f"Loaded transformation file: {self.yaml_path.name}")
            log.debug(f"  Metadata: {self.metadata.get('name', 'Unnamed')}")
            log.debug(f"  Transformations: {len(self.transformations)}")

        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML in {self.yaml_path}: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load {self.yaml_path}: {e}")

    def execute_all(self, duckdb_con: Any, job_name: str = "") -> Dict[str, Any]:
        """
        Execute all transformations in order

        Returns:
            Dict with execution details for reporting
        """
        results = {
            'metadata': self.metadata,
            'transformations': [],
            'total_count': len(self.transformations),
            'success_count': 0,
            'failed_count': 0,
        }

        log.info(f"Executing {len(self.transformations)} transformation(s) from {self.yaml_path.name}")

        for i, transform in enumerate(self.transformations, 1):
            name = transform.get('name', f'transform_{i}')
            description = transform.get('description', '')
            sql = transform.get('sql', '').strip()
            schema = transform.get('schema', '')
            tables_created = transform.get('tables_created', [])
            tags = transform.get('tags', [])
            depends_on = transform.get('depends_on', [])
            object_type = transform.get('object_type', 'TABLE')
            notes = transform.get('notes', '')

            log.info(f"  [{i}/{len(self.transformations)}] {name}")
            if description:
                log.debug(f"      {description}")
            if schema:
                log.debug(f"      Schema: {schema}")
            if tables_created:
                log.debug(f"      Creates: {', '.join(tables_created)}")

            result_entry = {
                'name': name,
                'description': description,
                'schema': schema,
                'tables_created': tables_created,
                'tags': tags,
                'depends_on': depends_on,
                'object_type': object_type,
                'notes': notes,
                'sql': sql,
                'sql_lines': len(sql.split('\n')),
                'status': 'pending',
                'error': None,
            }

            try:
                if not sql:
                    raise ValueError(f"Transformation '{name}' has no SQL")

                # Execute the SQL
                duckdb_con.execute(sql)

                result_entry['status'] = 'success'
                results['success_count'] += 1

                log.info(f"[OK] Success")

                # Try to get row count for created tables
                if tables_created:
                    for table in tables_created:
                        full_table = f"{schema}.{table}" if schema else table
                        try:
                            count = duckdb_con.execute(f"SELECT COUNT(*) FROM {full_table}").fetchone()[0]
                            log.debug(f"      Table {full_table}: {count:,} rows")
                        except Exception:
                            pass

            except Exception as e:
                result_entry['status'] = 'failed'
                result_entry['error'] = str(e)
                results['failed_count'] += 1
                log.error(f"      ✗ Failed: {e}")
                raise  # Re-raise to stop execution on error

            results['transformations'].append(result_entry)

        log.info(f"Transformation summary: {results['success_count']}/{results['total_count']} successful")
        return results

    def get_sql_list(self) -> List[str]:
        """Get list of all SQL statements (for backward compatibility)"""
        return [t.get('sql', '') for t in self.transformations if t.get('sql')]

    def get_combined_sql(self) -> str:
        """Get all SQL combined into one string (for backward compatibility)"""
        return '\n\n'.join(self.get_sql_list())


def load_yaml_transformations(yaml_path: Path) -> YamlSqlTransform:
    """Helper function to load YAML transformations"""
    return YamlSqlTransform(yaml_path)
