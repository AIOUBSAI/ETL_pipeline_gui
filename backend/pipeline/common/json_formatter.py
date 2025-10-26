"""
JSON-Lines formatter for structured logging output

This module provides JSON-based logging for integration with external applications
(e.g., Electron GUI) that need to parse and display logs with proper styling.

Output format: One JSON object per line (JSON-Lines / NDJSON)
{
    "timestamp": "2025-10-25T10:30:00.123Z",
    "level": "info",
    "category": "pipeline",
    "message": "Starting pipeline",
    "data": {...}  // Optional metadata
}
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from enum import Enum


class JSONLogLevel(str, Enum):
    """JSON log levels matching standard severity"""
    DEBUG = "debug"
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class JSONLogCategory(str, Enum):
    """Log categories for semantic grouping"""
    PIPELINE = "pipeline"
    STAGE = "stage"
    JOB = "job"
    EXTRACT = "extract"
    STAGE_DATA = "stage"
    TRANSFORM = "transform"
    LOAD = "load"
    DATABASE = "database"
    SYSTEM = "system"


class JSONLogger:
    """
    Structured JSON logger that outputs one JSON object per line.

    Each log entry includes:
    - timestamp: ISO 8601 format with timezone
    - level: debug, info, success, warning, error, critical
    - category: Semantic category (pipeline, job, stage, etc.)
    - message: Human-readable message
    - data: Optional structured metadata
    """

    def __init__(self, output_stream=None):
        """
        Initialize JSON logger

        Args:
            output_stream: Stream to write to (default: sys.stdout)
        """
        self.output_stream = output_stream or sys.stdout

    def _emit(
        self,
        level: JSONLogLevel,
        category: JSONLogCategory,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> None:
        """
        Emit a structured log entry as JSON

        Args:
            level: Log level
            category: Log category
            message: Human-readable message
            data: Optional structured data
            **kwargs: Additional fields to include
        """
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level.value,
            "category": category.value,
            "message": message,
        }

        # Add optional data
        if data:
            entry["data"] = data

        # Add any additional fields
        entry.update(kwargs)

        # Write as single-line JSON
        try:
            json_line = json.dumps(entry, ensure_ascii=False)
            self.output_stream.write(json_line + "\n")
            self.output_stream.flush()
        except Exception as e:
            # Fallback to stderr if JSON serialization fails
            sys.stderr.write(f"JSON logging error: {e}\n")
            sys.stderr.write(f"Message: {message}\n")

    # ========== STANDARD LOG LEVELS ==========

    def debug(self, message: str, data: Optional[Dict[str, Any]] = None, category: JSONLogCategory = JSONLogCategory.SYSTEM) -> None:
        """Debug level log"""
        self._emit(JSONLogLevel.DEBUG, category, message, data)

    def info(self, message: str, data: Optional[Dict[str, Any]] = None, category: JSONLogCategory = JSONLogCategory.SYSTEM) -> None:
        """Info level log"""
        self._emit(JSONLogLevel.INFO, category, message, data)

    def success(self, message: str, data: Optional[Dict[str, Any]] = None, category: JSONLogCategory = JSONLogCategory.SYSTEM) -> None:
        """Success level log"""
        self._emit(JSONLogLevel.SUCCESS, category, message, data)

    def warning(self, message: str, data: Optional[Dict[str, Any]] = None, category: JSONLogCategory = JSONLogCategory.SYSTEM) -> None:
        """Warning level log"""
        self._emit(JSONLogLevel.WARNING, category, message, data)

    def error(self, message: str, data: Optional[Dict[str, Any]] = None, category: JSONLogCategory = JSONLogCategory.SYSTEM) -> None:
        """Error level log"""
        self._emit(JSONLogLevel.ERROR, category, message, data)

    def critical(self, message: str, data: Optional[Dict[str, Any]] = None, category: JSONLogCategory = JSONLogCategory.SYSTEM) -> None:
        """Critical level log"""
        self._emit(JSONLogLevel.CRITICAL, category, message, data)

    # ========== PIPELINE-SPECIFIC METHODS ==========

    def pipeline_start(self, name: str, version: str = "", data: Optional[Dict[str, Any]] = None) -> None:
        """Log pipeline start"""
        msg = f"Starting Pipeline: {name}"
        if version:
            msg += f" (v{version})"

        pipeline_data = {"pipeline_name": name}
        if version:
            pipeline_data["version"] = version
        if data:
            pipeline_data.update(data)

        self._emit(JSONLogLevel.INFO, JSONLogCategory.PIPELINE, msg, pipeline_data)

    def pipeline_complete(self, elapsed: float, data: Optional[Dict[str, Any]] = None) -> None:
        """Log pipeline completion"""
        complete_data = {"elapsed_seconds": round(elapsed, 2)}
        if data:
            complete_data.update(data)

        self._emit(
            JSONLogLevel.SUCCESS,
            JSONLogCategory.PIPELINE,
            f"Pipeline completed in {elapsed:.2f}s",
            complete_data
        )

    def pipeline_failed(self, error: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log pipeline failure"""
        error_data = {"error": error}
        if data:
            error_data.update(data)

        self._emit(JSONLogLevel.ERROR, JSONLogCategory.PIPELINE, f"Pipeline failed: {error}", error_data)

    def pipeline_summary(self, total: int, success: int, failed: int, skipped: int, elapsed: float) -> None:
        """Log pipeline summary"""
        summary_data = {
            "total_jobs": total,
            "success": success,
            "failed": failed,
            "skipped": skipped,
            "elapsed_seconds": round(elapsed, 2)
        }

        self._emit(
            JSONLogLevel.INFO,
            JSONLogCategory.PIPELINE,
            "Pipeline Summary",
            summary_data
        )

    def stage_start(self, stage_name: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log stage start"""
        stage_data = {"stage": stage_name}
        if data:
            stage_data.update(data)

        self._emit(
            JSONLogLevel.INFO,
            JSONLogCategory.STAGE,
            f"STAGE: {stage_name.upper()}",
            stage_data
        )

    def job_start(self, stage: str, job_name: str, description: str = "", data: Optional[Dict[str, Any]] = None) -> None:
        """Log job start"""
        job_data = {"stage": stage, "job": job_name}
        if description:
            job_data["description"] = description
        if data:
            job_data.update(data)

        self._emit(
            JSONLogLevel.INFO,
            JSONLogCategory.JOB,
            f"[{stage}] {job_name}",
            job_data
        )

    def job_success(self, stage: str, job_name: str, details: str = "", data: Optional[Dict[str, Any]] = None) -> None:
        """Log job success"""
        job_data = {"stage": stage, "job": job_name}
        if details:
            job_data["details"] = details
        if data:
            job_data.update(data)

        msg = f"[{stage}] {job_name}"
        if details:
            msg += f": {details}"

        self._emit(JSONLogLevel.SUCCESS, JSONLogCategory.JOB, msg, job_data)

    def job_failed(self, stage: str, job_name: str, error: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log job failure"""
        job_data = {"stage": stage, "job": job_name, "error": error}
        if data:
            job_data.update(data)

        self._emit(
            JSONLogLevel.ERROR,
            JSONLogCategory.JOB,
            f"[{stage}] {job_name} FAILED: {error}",
            job_data
        )

    def job_skipped(self, stage: str, job_name: str, reason: str = "", data: Optional[Dict[str, Any]] = None) -> None:
        """Log job skipped"""
        job_data = {"stage": stage, "job": job_name}
        if reason:
            job_data["reason"] = reason
        if data:
            job_data.update(data)

        msg = f"[{stage}] {job_name} skipped"
        if reason:
            msg += f": {reason}"

        self._emit(JSONLogLevel.WARNING, JSONLogCategory.JOB, msg, job_data)

    # ========== STAGE-SPECIFIC LOGGING ==========

    def extract_file(self, file_name: str, rows: int, data: Optional[Dict[str, Any]] = None) -> None:
        """Log file extraction"""
        extract_data = {"file": file_name, "rows": rows}
        if data:
            extract_data.update(data)

        self._emit(
            JSONLogLevel.DEBUG,
            JSONLogCategory.EXTRACT,
            f"Reading: {file_name} ({rows} rows)",
            extract_data
        )

    def stage_table(self, table_name: str, schema: str, rows: int, data: Optional[Dict[str, Any]] = None) -> None:
        """Log table staging"""
        stage_data = {"table": table_name, "schema": schema, "rows": rows}
        if data:
            stage_data.update(data)

        self._emit(
            JSONLogLevel.DEBUG,
            JSONLogCategory.STAGE_DATA,
            f"Staging: {table_name} ({rows} rows)",
            stage_data
        )

    def transform_sql(self, sql: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log SQL transformation"""
        transform_data = {"sql": sql}
        if data:
            transform_data.update(data)

        self._emit(
            JSONLogLevel.DEBUG,
            JSONLogCategory.TRANSFORM,
            "Executing SQL transformation",
            transform_data
        )

    def load_file(self, output_path: str, rows: int, data: Optional[Dict[str, Any]] = None) -> None:
        """Log file load"""
        load_data = {"output_path": output_path, "rows": rows}
        if data:
            load_data.update(data)

        self._emit(
            JSONLogLevel.DEBUG,
            JSONLogCategory.LOAD,
            f"Writing: {output_path} ({rows} rows)",
            load_data
        )

    # ========== DATABASE LOGGING ==========

    def db_connect(self, db_type: str, path: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log database connection"""
        db_data = {"db_type": db_type, "path": path}
        if data:
            db_data.update(data)

        self._emit(
            JSONLogLevel.INFO,
            JSONLogCategory.DATABASE,
            f"{db_type.upper()} connection opened: {path}",
            db_data
        )

    def db_schema_created(self, schema: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Log schema creation"""
        schema_data = {"schema": schema}
        if data:
            schema_data.update(data)

        self._emit(
            JSONLogLevel.DEBUG,
            JSONLogCategory.DATABASE,
            f"Schema created: {schema}",
            schema_data
        )
