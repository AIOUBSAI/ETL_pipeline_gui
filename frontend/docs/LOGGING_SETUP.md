# Structured Logging Setup for Python ETL Pipeline

This document explains how to configure your Python ETL pipeline to output structured JSON logs that the desktop app can parse and display with proper log levels (info, warning, error, success).

## Overview

The desktop app now supports **JSON-Lines format** for structured logging. Each log line should be a valid JSON object with the following structure:

```json
{"level": "INFO", "message": "Pipeline started", "timestamp": "2025-10-25T10:30:00.123Z"}
```

## Python Logging Configuration

### Option 1: Custom JSON Formatter (Recommended)

Create a custom logging formatter that outputs JSON:

```python
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    """
    Custom formatter that outputs logs as JSON lines.
    Compatible with the desktop app's structured logging parser.
    """
    def format(self, record):
        log_data = {
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.now(datetime.UTC).isoformat().replace('+00:00', 'Z')
        }
        return json.dumps(log_data)

# Configure root logger
def setup_logging():
    """Setup JSON logging for the pipeline."""
    # Create console handler with JSON formatter
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JSONFormatter())

    # Configure root logger
    logging.root.handlers = []
    logging.root.addHandler(console_handler)
    logging.root.setLevel(logging.INFO)

# Initialize logging at the start of your pipeline
setup_logging()

# Usage examples
logger = logging.getLogger(__name__)
logger.info("Pipeline started")
logger.warning("Cache miss, will rebuild")
logger.error("Connection to database failed")
logger.info("Pipeline completed successfully")
```

### Option 2: python-json-logger Library

Use the `python-json-logger` library for more features:

```bash
pip install python-json-logger
```

```python
import logging
from pythonjsonlogger import jsonlogger

def setup_logging():
    """Setup JSON logging using python-json-logger."""
    console_handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        '%(levelname)s %(message)s %(created)s',
        rename_fields={'levelname': 'level', 'created': 'timestamp'}
    )
    console_handler.setFormatter(formatter)

    logging.root.handlers = []
    logging.root.addHandler(console_handler)
    logging.root.setLevel(logging.INFO)

setup_logging()
```

## Supported Log Levels

The desktop app maps Python logging levels to visual log types:

| Python Level | Desktop App Type | Color      | Icon    |
|-------------|------------------|------------|---------|
| `DEBUG`     | info             | Blue       | Info    |
| `INFO`      | info             | Blue       | Info    |
| `WARNING`   | warning          | Yellow     | Warning |
| `ERROR`     | error            | Red        | Error   |
| `CRITICAL`  | error            | Red        | Error   |
| `SUCCESS`*  | success          | Green      | Success |

*Note: `SUCCESS` is a custom level you can add if needed.

## Adding Custom SUCCESS Level

To add a custom SUCCESS log level:

```python
import logging

# Add SUCCESS level between INFO (20) and WARNING (30)
SUCCESS_LEVEL = 25
logging.addLevelName(SUCCESS_LEVEL, "SUCCESS")

def success(self, message, *args, **kwargs):
    if self.isEnabledFor(SUCCESS_LEVEL):
        self._log(SUCCESS_LEVEL, message, args, **kwargs)

# Monkey-patch the logger
logging.Logger.success = success

# Usage
logger = logging.getLogger(__name__)
logger.success("Pipeline completed successfully!")
```

## Integration with Your Pipeline

In your `pipeline/cli.py` or main entry point:

```python
import logging
from datetime import datetime
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.now(datetime.UTC).isoformat().replace('+00:00', 'Z')
        }
        return json.dumps(log_data)

def setup_json_logging():
    """Configure JSON logging for pipeline."""
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JSONFormatter())

    logging.root.handlers = []
    logging.root.addHandler(console_handler)
    logging.root.setLevel(logging.INFO)

def main():
    # Setup logging first
    setup_json_logging()

    logger = logging.getLogger(__name__)

    # Your pipeline code
    logger.info("Starting ETL pipeline")
    logger.info("Loading configuration")
    logger.info("Connecting to data sources")
    logger.warning("Using cached credentials")
    logger.info("Processing data")
    logger.error("Failed to process record 1234")
    logger.info("Pipeline completed")

if __name__ == "__main__":
    main()
```

## Backwards Compatibility

The desktop app gracefully handles both JSON and plain text logs:

- **JSON logs**: Parsed and displayed with proper log levels and colors
- **Plain text logs**: Displayed as info logs (stdout) or error logs (stderr)

You can gradually migrate to JSON logging without breaking existing functionality.

## Testing Your Logs

To test your JSON logging setup:

1. Run your pipeline from the command line:
   ```bash
   python -m pipeline.cli --pipeline config/pipeline_duckdb.yaml --dotenv .env --log-level user
   ```

2. Verify the output is valid JSON:
   ```json
   {"level": "INFO", "message": "Pipeline started", "timestamp": "2025-10-25T10:30:00.123Z"}
   {"level": "WARNING", "message": "Cache miss", "timestamp": "2025-10-25T10:30:01.456Z"}
   ```

3. Run from the desktop app and check that logs appear with correct colors/icons

## Example Output

**Console Output (JSON Lines):**
```json
{"level": "INFO", "message": "Starting pipeline", "timestamp": "2025-10-25T10:30:00.000Z"}
{"level": "INFO", "message": "Loading config from config/pipeline_duckdb.yaml", "timestamp": "2025-10-25T10:30:00.100Z"}
{"level": "WARNING", "message": "No cache found, will rebuild", "timestamp": "2025-10-25T10:30:01.000Z"}
{"level": "INFO", "message": "Processing 1000 records", "timestamp": "2025-10-25T10:30:02.000Z"}
{"level": "ERROR", "message": "Failed to process record at line 567", "timestamp": "2025-10-25T10:30:03.000Z"}
{"level": "INFO", "message": "Pipeline completed", "timestamp": "2025-10-25T10:30:05.000Z"}
```

**Desktop App Display:**
- ℹ️ **INFO** (Blue): Starting pipeline
- ℹ️ **INFO** (Blue): Loading config from config/pipeline_duckdb.yaml
- ⚠️ **WARNING** (Yellow): No cache found, will rebuild
- ℹ️ **INFO** (Blue): Processing 1000 records
- ❌ **ERROR** (Red): Failed to process record at line 567
- ℹ️ **INFO** (Blue): Pipeline completed

## Troubleshooting

### Logs not appearing in desktop app
- Check that your Python script outputs to stdout (not a file)
- Verify JSON format is valid (no extra whitespace, proper escaping)
- Ensure each log is on a separate line

### Colors not showing correctly
- Verify the `level` field matches supported levels (INFO, WARNING, ERROR, etc.)
- Check that the level is uppercase in the JSON output

### Mixed JSON and plain text
- This is supported! The app will parse JSON when possible and fall back to plain text
- Useful during migration or when using third-party libraries with text output
