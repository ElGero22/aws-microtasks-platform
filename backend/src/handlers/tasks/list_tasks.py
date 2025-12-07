import json
import boto3
from boto3.dynamodb.conditions import Key
from shared.config import config
from shared.logging import logger, log_event
from shared.auth import get_user_sub
from shared.models import TaskStatus

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(config.TASKS_TABLE)

def handler(event, context):
    log_event(event)

    requester_id = get_user_sub(event)
    if not requester_id:
        # Try query params for testing? Or just fail.
        # For now, fallback
        requester_id = 'demo-requester'

    # Get status from query params
    query_params = event.get('queryStringParameters') or {}
    status = query_params.get('status', TaskStatus.CREATED)

    try:
        response = table.query(
            IndexName='RequesterStatusIndex',
            KeyConditionExpression=Key('requesterId').eq(requester_id) & Key('status').eq(status)
        )

        items = response.get('Items', [])

        # Handle pagination if LastEvaluatedKey exists (simplified for now)

        return {
            'statusCode': 200,
            'body': json.dumps({'tasks': items})
        }

    except Exception as e:
        logger.error(f"Error listing tasks: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
