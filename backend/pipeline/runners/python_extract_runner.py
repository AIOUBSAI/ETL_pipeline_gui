"""
Python Extract Runner - Execute Python/Polars extractions in EXTRACT stage

This runner allows complex data extraction using Python code and Polars DataFrames
during the extract stage, complementing file-based readers (CSV, Excel, etc.).

Key features:
- Generate synthetic/test data programmatically
- Fetch data from APIs or web services
- Perform complex file processing beyond standard readers
- Access to the full processor library for data quality operations
- Return multiple tables from a single extraction

Use cases:
- API data extraction with authentication
- Generating test/seed data
- Web scraping and data parsing
- Custom file format processing
- Complex data generation algorithms
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Iterable
import importlib.util
import sys

import polars as pl

from pipeline.plugins.api import Reader, Table, Processor
from pipeline.plugins.registry import register_reader, PROCESSORS
from pipeline.common.logger import get_logger

log = get_logger()


@register_reader
class PythonExtractRunner(Reader):
    """
    Execute Python/Polars extraction during the extract stage.

    Configuration:
        runner: python_extract
        options:
            # Python extraction (inline or file)
            python_code: |
                # Inline Python code that creates DataFrames
                import polars as pl
                import requests

                # Example: Fetch from API
                response = requests.get("https://api.example.com/data")
                data_df = pl.DataFrame(response.json())

                # Example: Generate synthetic data
                synthetic_df = pl.DataFrame({
                    "id": range(1, 101),
                    "value": [i * 2 for i in range(1, 101)]
                })

            # OR use external file
            python_file: "extracts/python/api_extractor.py"

            # Output table names (maps variable names to table names)
            output:
                - source_df: "data_df"        # Variable name in Python
                  table: "api_data"           # Table name for pipeline
                - source_df: "synthetic_df"
                  table: "synthetic_data"

            # Optional: Apply processors to extracted DataFrames
            processors:
                - normalize_headers
                - name: type_cast
                  type_cast:
                    age: "int"
                    price: "float"

    Example Python extraction file:
        ```python
        # extracts/python/api_extractor.py
        import polars as pl
        import requests
        from typing import Dict

        def extract() -> Dict[str, pl.DataFrame]:
            '''
            Extract function should return a dictionary of DataFrames.
            Keys are used as variable names in the output mapping.
            '''
            # Fetch from API
            response = requests.get("https://api.example.com/customers")
            customers_df = pl.DataFrame(response.json())

            # Fetch related data
            response = requests.get("https://api.example.com/orders")
            orders_df = pl.DataFrame(response.json())

            # Generate metadata
            metadata_df = pl.DataFrame({
                "extraction_date": [datetime.now()],
                "record_count": [len(customers_df)]
            })

            return {
                "customers": customers_df,
                "orders": orders_df,
                "metadata": metadata_df
            }
        ```
    """
    name = "python_extract"

    def can_handle(self, source: Dict[str, Any]) -> bool:
        return source.get("runner") == "python_extract"

    def read(self, source: Dict[str, Any], base_dir: Path) -> Iterable[Table]:
        """
        Execute Python extraction.

        Args:
            source: Job configuration (contains python_code/python_file, output, processors, etc.)
            base_dir: Base directory for resolving relative paths

        Yields:
            Table objects containing extracted DataFrames
        """
        log.info(f"Executing Python extraction")

        # Step 1: Execute Python extraction
        python_code = source.get("python_code")
        python_file = source.get("python_file")

        if python_file:
            result_dfs = self._execute_python_file(python_file, base_dir)
        elif python_code:
            result_dfs = self._execute_python_code(python_code)
        else:
            raise ValueError("Python extract requires either 'python_code' or 'python_file'")

        log.dev(f"  Python execution complete: {len(result_dfs)} result DataFrame(s)")

        # Step 2: Apply processors if specified
        processors_cfg = source.get("processors", [])
        if processors_cfg:
            result_dfs = self._apply_processors(result_dfs, processors_cfg)

        # Step 3: Map DataFrames to table names and yield
        output_configs = source.get("output", [])

        if not output_configs:
            # If no explicit mapping, yield all DataFrames with their variable names
            for df_name, df in result_dfs.items():
                log.dev(f"  Yielding table '{df_name}': {len(df)} rows × {len(df.columns)} columns")
                yield Table(name=df_name, df=df)
        else:
            # Use explicit mapping
            for config in output_configs:
                source_df_name = config.get("source_df", "")
                table_name = config.get("table", source_df_name)

                if not source_df_name:
                    raise ValueError("Output configuration missing 'source_df' field")

                if source_df_name not in result_dfs:
                    raise ValueError(
                        f"Source DataFrame '{source_df_name}' not found. "
                        f"Available: {list(result_dfs.keys())}"
                    )

                df = result_dfs[source_df_name]
                log.dev(f"  Yielding table '{table_name}': {len(df)} rows × {len(df.columns)} columns")
                yield Table(name=table_name, df=df)

        log.info(f"[OK] Python extraction complete")

    def _execute_python_file(
        self,
        python_file: str,
        base_dir: Path
    ) -> Dict[str, pl.DataFrame]:
        """Execute Python extraction from external file."""
        python_path = Path(python_file)

        # Resolve relative paths from base_dir
        if not python_path.is_absolute():
            python_path = base_dir / python_path

        if not python_path.exists():
            raise FileNotFoundError(f"Python extraction file not found: {python_file}")

        log.dev(f"  Executing Python file: {python_path.name}")

        # Load the Python module
        spec = importlib.util.spec_from_file_location("extract_module", python_path)
        if not spec or not spec.loader:
            raise ValueError(f"Cannot load Python file: {python_file}")

        module = importlib.util.module_from_spec(spec)
        sys.modules["extract_module"] = module
        spec.loader.exec_module(module)

        # Look for an extract function
        if not hasattr(module, "extract"):
            raise ValueError(
                f"Python file must define an 'extract' function. "
                f"Expected signature: extract() -> Dict[str, pl.DataFrame]"
            )

        extract_func = module.extract

        # Execute the extract function
        try:
            result = extract_func()

            if not isinstance(result, dict):
                raise ValueError(
                    f"Extract function must return Dict[str, pl.DataFrame], got {type(result)}"
                )

            # Validate all values are DataFrames
            for key, value in result.items():
                if not isinstance(value, pl.DataFrame):
                    raise ValueError(
                        f"Extract result '{key}' is not a Polars DataFrame: {type(value)}"
                    )

            return result

        except Exception as e:
            log.error(f"Python extraction failed: {e}")
            raise

    def _execute_python_code(
        self,
        python_code: str
    ) -> Dict[str, pl.DataFrame]:
        """Execute inline Python extraction code."""
        log.dev(f"  Executing inline Python code ({len(python_code)} chars)")
        log.debug(f"Python code:\n{python_code}")

        # Create execution namespace
        namespace = {
            "pl": pl,
            "log": log,
        }

        # Execute the Python code
        try:
            exec(python_code, namespace)
        except Exception as e:
            log.error(f"Python code execution failed: {e}")
            raise

        # Extract result DataFrames (any pl.DataFrame variables created)
        result_dfs = {}
        for key, value in namespace.items():
            if isinstance(value, pl.DataFrame):
                result_dfs[key] = value
                log.debug(f"    Found result DataFrame: {key}")

        if not result_dfs:
            log.warning("No result DataFrames found. Ensure your code creates pl.DataFrame variables.")

        return result_dfs

    def _apply_processors(
        self,
        dataframes: Dict[str, pl.DataFrame],
        processors_cfg: List[Any]
    ) -> Dict[str, pl.DataFrame]:
        """Apply processors to DataFrames."""
        log.dev(f"  Applying {len(processors_cfg)} processor(s)")

        result = {}
        for df_name, df in dataframes.items():
            log.debug(f"    Processing '{df_name}'")

            # Apply each processor to the DataFrame
            processed_df = df
            for proc_desc in processors_cfg:
                proc_name, proc_opts = self._normalize_processor(proc_desc)

                # Find processor
                processor = self._get_processor(proc_name)
                if not processor:
                    log.warning(f"      Processor '{proc_name}' not found, skipping")
                    continue

                # Build context
                proc_ctx = {
                    "processor_options": proc_opts,
                    "table_name": df_name,
                }

                # Check if processor applies
                if not processor.applies_to(proc_ctx):
                    log.debug(f"      Processor '{proc_name}' does not apply, skipping")
                    continue

                # Apply processor (processors work with DataFrames directly, not Table objects)
                log.debug(f"      Applying: {proc_name}")
                try:
                    processed_df = processor.process(processed_df, proc_ctx)
                except Exception as e:
                    log.error(f"      Processor '{proc_name}' failed: {e}")
                    raise

            result[df_name] = processed_df

        return result

    def _normalize_processor(self, proc_desc: Any) -> tuple[str, Dict[str, Any]]:
        """Normalize processor description to (name, options)."""
        if isinstance(proc_desc, str):
            return proc_desc, {}
        elif isinstance(proc_desc, dict):
            name = proc_desc.get("name", "")
            if not name:
                # If no 'name' key, treat the whole dict as options for the first key
                name = list(proc_desc.keys())[0]
                return name, proc_desc
            else:
                opts = {k: v for k, v in proc_desc.items() if k != "name"}
                return name, opts
        else:
            raise ValueError(f"Invalid processor descriptor: {proc_desc}")

    def _get_processor(self, name: str) -> Optional[Processor]:
        """Get processor by name from registry."""
        if name in PROCESSORS:
            return PROCESSORS[name]()  # Instantiate the processor class
        return None
