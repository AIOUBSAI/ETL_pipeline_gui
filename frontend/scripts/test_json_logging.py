"""
Test script to demonstrate JSON structured logging.
This script outputs logs in JSON format that the desktop app can parse.

Run this from the desktop app to see structured logs with different levels.
"""

import logging
import json
import time
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


def setup_json_logging():
    """Setup JSON logging for the test script."""
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JSONFormatter())

    logging.root.handlers = []
    logging.root.addHandler(console_handler)
    logging.root.setLevel(logging.DEBUG)


def main():
    """Main test function demonstrating different log levels."""
    # Setup JSON logging
    setup_json_logging()
    logger = logging.getLogger(__name__)

    # Test different log levels
    logger.info("=" * 60)
    logger.info("JSON STRUCTURED LOGGING TEST")
    logger.info("=" * 60)

    time.sleep(0.5)

    logger.info("Testing INFO level logs...")
    time.sleep(0.3)

    logger.info("Pipeline initialization started")
    time.sleep(0.2)

    logger.info("Configuration loaded successfully")
    time.sleep(0.2)

    logger.info("Testing WARNING level logs...")
    time.sleep(0.3)

    logger.warning("This is a warning message")
    time.sleep(0.2)

    logger.warning("Cache not found, will rebuild from scratch")
    time.sleep(0.2)

    logger.warning("Deprecated API version detected")
    time.sleep(0.3)

    logger.info("Testing ERROR level logs...")
    time.sleep(0.3)

    logger.error("Connection to database failed")
    time.sleep(0.2)

    logger.error("Failed to process record at line 1234")
    time.sleep(0.2)

    logger.error("Invalid configuration parameter: timeout")
    time.sleep(0.3)

    logger.info("Testing CRITICAL level logs...")
    time.sleep(0.3)

    logger.critical("Critical system error detected")
    time.sleep(0.2)

    logger.critical("Out of memory - cannot continue")
    time.sleep(0.3)

    logger.info("All log level tests completed")
    logger.info("=" * 60)
    logger.info("Test finished successfully!")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
