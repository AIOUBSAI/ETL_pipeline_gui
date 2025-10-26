#!/usr/bin/env python
"""
CLI for stage-based pipeline execution
Usage: python -m pipeline.cli --pipeline config/pipeline.yaml
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any, Dict

import yaml
from dotenv import load_dotenv

from pipeline.common.utils import ts, safe_mkdir, clean_directory, load_yaml
from pipeline.core.orchestrator import orchestrator
from pipeline.common.logger import init_logger, LogLevel, LogFormat
from pipeline.common.validators import validate_pipeline


def main() -> None:
    t0 = time.perf_counter()

    # Parse CLI args
    parser = argparse.ArgumentParser(
        description="Run stage-based ETL pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m pipeline.cli --pipeline config/pipeline.yaml
  python -m pipeline.cli --pipeline config/pipeline.yaml --dotenv .env.prod
  python -m pipeline.cli --pipeline config/pipeline.yaml --set execution.parallel_jobs=false
        """
    )
    parser.add_argument(
        "--pipeline",
        default="config/pipeline.yaml",
        help="Path to pipeline configuration file (default: config/pipeline.yaml)"
    )
    parser.add_argument(
        "--dotenv",
        help="Path to .env file to load (optional)"
    )
    parser.add_argument(
        "--set",
        action="append",
        help="Override config with dotted.key=value (repeatable)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate pipeline without executing"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run comprehensive validation (Python syntax, SQL syntax, schemas, imports)"
    )
    parser.add_argument(
        "--log-level",
        choices=["user", "dev", "debug"],
        default="user",
        help="Logging verbosity: user (clean), dev (detailed), debug (very verbose)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output logs in JSON-Lines format (for GUI integration)"
    )
    args = parser.parse_args()

    # Initialize logger
    log_format = LogFormat.JSON if args.json else LogFormat.TEXT
    init_logger(args.log_level, log_format)

    # Load environment
    load_dotenv(args.dotenv) if args.dotenv else load_dotenv()

    # Load pipeline configuration
    pipeline_path = Path(args.pipeline)
    if not pipeline_path.exists():
        raise FileNotFoundError(f"Pipeline config not found: {pipeline_path}")

    from pipeline.common.logger import get_logger
    log = get_logger()

    log.info(f"Loading pipeline: {pipeline_path}")
    pipeline_config = load_yaml(pipeline_path)

    if not pipeline_config:
        raise ValueError(f"Empty or invalid pipeline config: {pipeline_path}")

    # Apply --set overrides
    if args.set:
        for override in args.set:
            if "=" not in override:
                raise ValueError(f"--set expects dotted.key=value, got: {override}")
            key, value = override.split("=", 1)
            _set_dotted(pipeline_config, key.strip(), value)

    # Get paths from config
    variables = pipeline_config.get("variables", {})
    output_dir = Path(variables.get("OUTPUT_DIR", "./out/exports"))

    # Ensure directories exist
    safe_mkdir(output_dir)

    # Validation mode (--validate or --dry-run)
    if args.validate or args.dry_run:
        mode_name = "VALIDATION" if args.validate else "DRY RUN"
        log.info(f"{mode_name} MODE - Validating pipeline")
        log.info("")

        # Run basic validation
        _validate_pipeline(pipeline_config)

        # Run comprehensive validation
        # Use current working directory as base path for resolving relative paths
        is_valid = validate_pipeline(pipeline_config, base_path=Path.cwd())

        if not is_valid:
            log.error("Pipeline validation FAILED")
            exit(1)
        else:
            log.success("Pipeline validation SUCCESSFUL")
        return

    # Execute pipeline
    log.info("Starting pipeline execution")
    orchestrator(
        pipeline_config=pipeline_config,
        out_dir=output_dir,
        ctx=None
    )

    elapsed = time.perf_counter() - t0
    log.info("========================================")
    log.info(f"Pipeline completed in {elapsed:.2f}s")
    log.info("========================================")


def _set_dotted(config: Dict[str, Any], dotted_key: str, value: str) -> None:
    """Set a value in nested dict using dotted notation"""
    # Try to parse value as YAML for proper types
    try:
        parsed_value = yaml.safe_load(value)
    except Exception:
        parsed_value = value

    parts = dotted_key.split(".")
    current = config

    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]

    current[parts[-1]] = parsed_value


def _validate_pipeline(config: Dict[str, Any]) -> None:
    """Validate pipeline configuration"""
    # Check required sections
    required = ["stages", "jobs", "runners"]
    for section in required:
        if section not in config:
            raise ValueError(f"Missing required section: {section}")

    # Check stages
    stages = config.get("stages", [])
    if not stages:
        raise ValueError("No stages defined")

    # Check jobs
    jobs = config.get("jobs", {})
    if not jobs:
        raise ValueError("No jobs defined")

    # Validate each job
    for job_name, job_config in jobs.items():
        if "stage" not in job_config:
            raise ValueError(f"Job '{job_name}' missing required field: stage")

        job_stage = job_config["stage"]
        if job_stage not in stages:
            raise ValueError(f"Job '{job_name}' references unknown stage: {job_stage}")

        if "runner" not in job_config:
            raise ValueError(f"Job '{job_name}' missing required field: runner")

        runner_name = job_config["runner"]
        runners = config.get("runners", {})
        if runner_name not in runners:
            raise ValueError(f"Job '{job_name}' references unknown runner: {runner_name}")

    # Validate dependencies
    job_names = set(jobs.keys())
    for job_name, job_config in jobs.items():
        depends_on = job_config.get("depends_on", [])
        for dep in depends_on:
            if dep not in job_names:
                raise ValueError(f"Job '{job_name}' depends on unknown job: {dep}")

    from pipeline.common.logger import get_logger
    log = get_logger()

    log.success(f"Stages: {len(stages)}")
    log.success(f"Jobs: {len(jobs)}")
    log.success(f"Runners: {len(config.get('runners', {}))}")
    log.success("Dependencies validated")


if __name__ == "__main__":
    main()
