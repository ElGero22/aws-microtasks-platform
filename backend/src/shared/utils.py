"""
Common utility functions for Lambda handlers.
"""
import json
from decimal import Decimal
from typing import Any, Dict


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types from DynamoDB."""
    
    def default(self, o):
        if isinstance(o, Decimal):
            # Convert to int if it's a whole number, otherwise float
            if o % 1 == 0:
                return int(o)
            return float(o)
        return super().default(o)


def format_response(
    status_code: int,
    body: Any,
    headers: Dict[str, str] = None
) -> Dict[str, Any]:
    """
    Format a standard API Gateway response with CORS headers.
    
    Args:
        status_code: HTTP status code
        body: Response body (will be JSON serialized)
        headers: Additional headers to include
        
    Returns:
        API Gateway response dict
    """
    default_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': True,
        'Content-Type': 'application/json'
    }
    
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body, cls=DecimalEncoder)
    }


def parse_body(event: dict) -> dict:
    """
    Safely parse JSON body from API Gateway event.
    
    Args:
        event: API Gateway Lambda proxy event
        
    Returns:
        Parsed body dict or empty dict if invalid
    """
    try:
        body = event.get('body', '{}')
        if isinstance(body, str):
            return json.loads(body)
        return body or {}
    except (json.JSONDecodeError, TypeError):
        return {}


def get_path_param(event: dict, param_name: str) -> str:
    """Extract path parameter from event."""
    try:
        return event['pathParameters'][param_name]
    except (KeyError, TypeError):
        return None


def get_query_param(event: dict, param_name: str, default: str = None) -> str:
    """Extract query string parameter from event."""
    try:
        params = event.get('queryStringParameters') or {}
        return params.get(param_name, default)
    except (KeyError, TypeError):
        return default
