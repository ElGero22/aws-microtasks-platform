"""
DynamoDB utility functions for batch operations.
"""
import boto3
from typing import List, Dict, Any, Optional
from boto3.dynamodb.conditions import Key, Attr
from .config import config
from .logging import logger

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def batch_write_items(table_name: str, items: List[Dict[str, Any]]) -> bool:
    """
    Write multiple items to DynamoDB using batch_write_item.
    Handles batching (max 25 items per batch) automatically.
    
    Args:
        table_name: Name of the DynamoDB table
        items: List of items to write
        
    Returns:
        True if all items written successfully, False otherwise
    """
    try:
        table = dynamodb.Table(table_name)
        
        with table.batch_writer() as batch:
            for item in items:
                batch.put_item(Item=item)
        
        logger.info(f"Successfully wrote {len(items)} items to {table_name}")
        return True
        
    except Exception as e:
        logger.error(f"Error batch writing to {table_name}: {e}")
        return False


def query(
    table_name: str,
    index_name: Optional[str] = None,
    key_condition: Optional[Any] = None,
    filter_expression: Optional[Any] = None,
    limit: Optional[int] = None,
    scan_forward: bool = True
) -> List[Dict[str, Any]]:
    """
    Query DynamoDB table or index.
    
    Args:
        table_name: Name of the DynamoDB table
        index_name: Optional GSI name
        key_condition: Key condition expression
        filter_expression: Optional filter expression
        limit: Max items to return
        scan_forward: True for ascending, False for descending
        
    Returns:
        List of items matching the query
    """
    try:
        table = dynamodb.Table(table_name)
        
        query_params = {
            'ScanIndexForward': scan_forward
        }
        
        if index_name:
            query_params['IndexName'] = index_name
        if key_condition:
            query_params['KeyConditionExpression'] = key_condition
        if filter_expression:
            query_params['FilterExpression'] = filter_expression
        if limit:
            query_params['Limit'] = limit
            
        response = table.query(**query_params)
        return response.get('Items', [])
        
    except Exception as e:
        logger.error(f"Error querying {table_name}: {e}")
        return []


def get_item(table_name: str, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Get a single item from DynamoDB."""
    try:
        table = dynamodb.Table(table_name)
        response = table.get_item(Key=key)
        return response.get('Item')
    except Exception as e:
        logger.error(f"Error getting item from {table_name}: {e}")
        return None


def update_item(
    table_name: str,
    key: Dict[str, Any],
    update_expression: str,
    expression_values: Dict[str, Any],
    expression_names: Optional[Dict[str, str]] = None
) -> bool:
    """Update an item in DynamoDB."""
    try:
        table = dynamodb.Table(table_name)
        
        params = {
            'Key': key,
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': expression_values
        }
        
        if expression_names:
            params['ExpressionAttributeNames'] = expression_names
            
        table.update_item(**params)
        return True
        
    except Exception as e:
        logger.error(f"Error updating item in {table_name}: {e}")
        return False
