"""
Logging utilities for Lambda handlers.
"""
import logging
import json

# Configure logger
logger = logging.getLogger('microtasks')
logger.setLevel(logging.INFO)

# Add handler if not already configured
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    logger.addHandler(handler)


def log_event(event: dict) -> None:
    """Log incoming Lambda event for debugging."""
    try:
        # Avoid logging sensitive data
        safe_event = {k: v for k, v in event.items() if k not in ['body', 'headers']}
        logger.info(f"Lambda event: {json.dumps(safe_event, default=str)}")
    except Exception as e:
        logger.warning(f"Could not log event: {e}")
