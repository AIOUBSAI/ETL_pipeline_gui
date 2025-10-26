"""
Logging module for pipeline with dev/user modes

Dev mode: Detailed logging for debugging (shows file paths, row counts, SQL, etc.)
User mode: Clean, simple logging showing only important steps
JSON mode: Structured JSON-Lines output for external integrations (e.g., Electron GUI)
"""
from __future__ import annotations

import sys
from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pathlib import Path


class LogLevel(Enum):
    """Logging levels"""
    USER = "user"      # Simple, clean logging for end users
    DEV = "dev"        # Detailed logging for developers
    DEBUG = "debug"    # Very verbose logging


class LogFormat(Enum):
    """Log output formats"""
    TEXT = "text"      # Human-readable text with colors
    JSON = "json"      # Structured JSON-Lines format


class Logger:
    """Pipeline logger with configurable verbosity and output format"""

    def __init__(self, level: LogLevel = LogLevel.USER, format: LogFormat = LogFormat.TEXT):
        self.level = level
        self.format = format
        self._colors_enabled = sys.stdout.isatty() and format == LogFormat.TEXT
        self._json_logger = None

        # Initialize JSON logger if needed
        if format == LogFormat.JSON:
            from pipeline.common.json_formatter import JSONLogger
            self._json_logger = JSONLogger()

    def _timestamp(self) -> str:
        """Get formatted timestamp"""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _format_message(self, msg: str, prefix: str = "", color: str = "") -> str:
        """Format a log message with optional color"""
        ts = self._timestamp()
        if self._colors_enabled and color:
            return f"{color}[{ts}]{prefix} {msg}\033[0m"
        return f"[{ts}]{prefix} {msg}"

    # ========== USER-LEVEL LOGGING (Always shown) ==========

    def info(self, msg: str) -> None:
        """Info message (shown in all modes)"""
        if self.format == LogFormat.JSON:
            self._json_logger.info(msg)
        else:
            print(self._format_message(msg, color="\033[36m"))  # Cyan

    def success(self, msg: str) -> None:
        """Success message (shown in all modes)"""
        if self.format == LogFormat.JSON:
            self._json_logger.success(msg)
        else:
            print(self._format_message(msg, prefix=" [OK]", color="\033[32m"))  # Green

    def warning(self, msg: str) -> None:
        """Warning message (shown in all modes)"""
        if self.format == LogFormat.JSON:
            self._json_logger.warning(msg)
        else:
            print(self._format_message(msg, prefix=" [WARN]", color="\033[33m"))  # Yellow

    def error(self, msg: str) -> None:
        """Error message (shown in all modes)"""
        if self.format == LogFormat.JSON:
            self._json_logger.error(msg)
        else:
            print(self._format_message(msg, prefix=" [ERROR]", color="\033[31m"))  # Red

    def stage(self, stage_name: str) -> None:
        """Stage header (shown in all modes)"""
        if self.format == LogFormat.JSON:
            self._json_logger.stage_start(stage_name)
        else:
            line = "=" * 60
            print(f"\n{self._format_message(line, color='\033[35m')}")  # Magenta
            print(self._format_message(f"STAGE: {stage_name.upper()}", color="\033[35m\033[1m"))  # Bold Magenta
            print(f"{self._format_message(line, color='\033[35m')}\n")

    # ========== DEV-LEVEL LOGGING (Shown in dev/debug modes) ==========

    def dev(self, msg: str) -> None:
        """Development message (shown only in dev/debug mode)"""
        if self.level in (LogLevel.DEV, LogLevel.DEBUG):
            if self.format == LogFormat.JSON:
                self._json_logger.debug(msg)
            else:
                print(self._format_message(msg, prefix=" [DEV]", color="\033[90m"))  # Gray

    def dev_detail(self, label: str, value: Any) -> None:
        """Development detail (shown only in dev/debug mode)"""
        if self.level in (LogLevel.DEV, LogLevel.DEBUG):
            if self.format == LogFormat.JSON:
                self._json_logger.debug(f"{label}: {value}", data={"label": label, "value": str(value)})
            else:
                print(self._format_message(f"{label}: {value}", prefix=" [DEV]", color="\033[90m"))

    # ========== DEBUG-LEVEL LOGGING (Shown only in debug mode) ==========

    def debug(self, msg: str) -> None:
        """Debug message (shown only in debug mode)"""
        if self.level == LogLevel.DEBUG:
            if self.format == LogFormat.JSON:
                self._json_logger.debug(msg)
            else:
                print(self._format_message(msg, prefix=" [DEBUG]", color="\033[90m"))

    # ========== SPECIALIZED LOGGING METHODS ==========

    def job_start(self, stage: str, job_name: str, description: str = "") -> None:
        """Log job start"""
        if self.format == LogFormat.JSON:
            self._json_logger.job_start(stage, job_name, description)
        elif self.level == LogLevel.USER:
            print(self._format_message(f"[{stage}] {job_name}", color="\033[36m"))
        else:
            print(self._format_message(f"[{stage}] Running: {job_name}", color="\033[36m"))
            if description:
                self.dev(f"  Description: {description}")

    def job_success(self, stage: str, job_name: str, details: str = "") -> None:
        """Log job success"""
        if self.format == LogFormat.JSON:
            self._json_logger.job_success(stage, job_name, details)
        elif self.level == LogLevel.USER:
            msg = f"[{stage}] {job_name}"
            if details:
                msg += f" - {details}"
            self.success(msg)
        else:
            self.success(f"[{stage}] {job_name}: {details if details else 'completed'}")

    def job_failed(self, stage: str, job_name: str, error: str) -> None:
        """Log job failure"""
        if self.format == LogFormat.JSON:
            self._json_logger.job_failed(stage, job_name, error)
        else:
            self.error(f"[{stage}] {job_name} FAILED: {error}")

    def job_skipped(self, stage: str, job_name: str, reason: str = "") -> None:
        """Log job skipped"""
        if self.level != LogLevel.USER or self.format == LogFormat.JSON:
            if self.format == LogFormat.JSON:
                self._json_logger.job_skipped(stage, job_name, reason)
            else:
                msg = f"[{stage}] {job_name} skipped"
                if reason:
                    msg += f": {reason}"
                self.warning(msg)

    # ========== EXTRACT STAGE LOGGING ==========

    def extract_start(self, job_name: str, source_type: str, path: str, files: str) -> None:
        """Log extract job start"""
        self.job_start("extract", job_name)
        self.dev_detail("  Source type", source_type)
        self.dev_detail("  Path", path)
        self.dev_detail("  Files", files)

    def extract_file(self, file_path: Path, rows: int) -> None:
        """Log file extraction"""
        self.dev(f"    Reading: {file_path.name} ({rows} rows)")

    def extract_success(self, job_name: str, table_name: str, total_rows: int, files_count: int = 1) -> None:
        """Log extract success"""
        if self.level == LogLevel.USER:
            self.job_success("extract", job_name, f"{total_rows} rows")
        else:
            self.job_success("extract", job_name, f"{total_rows} rows from {files_count} file(s) -> {table_name}")

    def extract_no_data(self, job_name: str, reason: str = "") -> None:
        """Log extract produced no data"""
        if self.level != LogLevel.USER:
            msg = f"No data extracted"
            if reason:
                msg += f": {reason}"
            self.job_skipped("extract", job_name, msg)

    # ========== STAGE LOGGING ==========

    def stage_start(self, job_name: str, schema: str, table_count: int) -> None:
        """Log stage job start"""
        self.job_start("stage", job_name)
        self.dev_detail("  Schema", schema)
        self.dev_detail("  Tables to stage", table_count)

    def stage_table(self, table_name: str, rows: int) -> None:
        """Log table staging"""
        self.dev(f"    Staging: {table_name} ({rows} rows)")

    def stage_success(self, job_name: str, schema: str, table_count: int) -> None:
        """Log stage success"""
        if self.level == LogLevel.USER:
            self.job_success("stage", job_name, f"{table_count} tables")
        else:
            self.job_success("stage", job_name, f"{table_count} tables -> {schema} schema")

    # ========== TRANSFORM LOGGING ==========

    def transform_start(self, job_name: str, sql_source: str = "inline") -> None:
        """Log transform job start"""
        self.job_start("transform", job_name)
        self.dev_detail("  SQL source", sql_source)

    def transform_sql(self, sql: str) -> None:
        """Log SQL being executed"""
        if self.level == LogLevel.DEBUG:
            self.debug("  SQL:")
            for line in sql.split('\n'):
                if line.strip():
                    self.debug(f"    {line}")

    def transform_success(self, job_name: str, table_created: str = "") -> None:
        """Log transform success"""
        if self.level == LogLevel.USER:
            self.job_success("transform", job_name)
        else:
            msg = "SQL executed successfully"
            if table_created:
                msg += f" -> {table_created}"
            self.job_success("transform", job_name, msg)

    # ========== LOAD LOGGING ==========

    def load_start(self, job_name: str, output_type: str, output_path: str) -> None:
        """Log load job start"""
        self.job_start("load", job_name)
        self.dev_detail("  Output type", output_type)
        self.dev_detail("  Output path", output_path)

    def load_query(self, query: str) -> None:
        """Log query being executed for load"""
        if self.level == LogLevel.DEBUG:
            self.debug("  Query:")
            for line in query.split('\n'):
                if line.strip():
                    self.debug(f"    {line}")

    def load_success(self, job_name: str, output_path: str, row_count: int) -> None:
        """Log load success"""
        if self.level == LogLevel.USER:
            self.job_success("load", job_name, Path(output_path).name)
        else:
            self.job_success("load", job_name, f"{row_count} rows -> {output_path}")

    # ========== PIPELINE SUMMARY ==========

    def pipeline_start(self, name: str, version: str = "") -> None:
        """Log pipeline start"""
        if self.format == LogFormat.JSON:
            self._json_logger.pipeline_start(name, version)
        else:
            msg = f"Starting Pipeline: {name}"
            if version:
                msg += f" (v{version})"
            self.info(msg)

    def pipeline_summary(self, total_jobs: int, success: int, failed: int, skipped: int, elapsed: float) -> None:
        """Log pipeline summary"""
        if self.format == LogFormat.JSON:
            self._json_logger.pipeline_summary(total_jobs, success, failed, skipped, elapsed)
        else:
            line = "=" * 60
            print(f"\n{line}")
            print(f"PIPELINE SUMMARY")
            print(line)
            print(f"  Total Jobs:    {total_jobs}")
            print(f"  Success:       {success}")
            if failed > 0:
                print(f"  Failed:        {failed}")
            if skipped > 0:
                print(f"  Skipped:       {skipped}")
            print(f"  Elapsed Time:  {elapsed:.2f}s")
            print(line)

    def pipeline_failed_jobs(self, failed_jobs: list[tuple[str, str]]) -> None:
        """Log details of failed jobs"""
        if failed_jobs:
            print("\nFailed Jobs:")
            for job_name, error in failed_jobs:
                print(f"  ✗ {job_name}")
                print(f"    Error: {error}")

    # ========== DATABASE LOGGING ==========

    def db_connect(self, db_type: str, path: str) -> None:
        """Log database connection"""
        if self.level != LogLevel.USER:
            self.info(f"{db_type.upper()} connection opened: {path}")

    def db_schema_created(self, schema: str) -> None:
        """Log schema creation"""
        self.dev(f"  Schema created: {schema}")

    def db_reset(self, path: str) -> None:
        """Log database reset"""
        self.dev(f"  Database reset: {path}")


# Global logger instance
_logger: Optional[Logger] = None


def get_logger() -> Logger:
    """Get the global logger instance"""
    global _logger
    if _logger is None:
        _logger = Logger(LogLevel.USER)
    return _logger


def set_log_level(level: LogLevel | str) -> None:
    """Set the global log level"""
    global _logger
    if isinstance(level, str):
        level = LogLevel(level.lower())
    # Update the existing logger instance instead of creating a new one
    # This ensures all modules that imported the logger will see the new level
    if _logger is None:
        _logger = Logger(level)
    else:
        _logger.level = level


def init_logger(level: LogLevel | str = LogLevel.USER, format: LogFormat | str = LogFormat.TEXT) -> Logger:
    """Initialize and return the global logger"""
    global _logger
    if isinstance(level, str):
        level = LogLevel(level.lower())
    if isinstance(format, str):
        format = LogFormat(format.lower())

    _logger = Logger(level, format)
    return _logger
