import json
import boto3
from boto3.dynamodb.conditions import Key
from shared.config import config
from shared.logging import logger, log_event
from shared.models import TaskStatus

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(config.TASKS_TABLE)

def handler(event, context):
    log_event(event)

    try:
        # Query tasks with status 'Published'
        # Using the StatusIndex created in DataStack
        response = table.query(
            IndexName='StatusIndex',
            KeyConditionExpression=Key('status').eq(TaskStatus.PUBLISHED)
        )

        items = response.get('Items', [])

        # Sort by createdAt desc? The index sort key is createdAt.
        # By default query returns in ascending order of sort key.
        # If we want newest first, ScanIndexForward=False.

        # Let's fetch sorting preference from query params if we want,
        # but for now let's just return them.
        # Actually, workers probably want to see new tasks? or oldest tasks (FIFO)?
        # Let's default to default order (Ascending -> Oldest first) so oldest tasks get done.

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True,
            },
            'body': json.dumps({'tasks': items})
        }

    except Exception as e:
        logger.error(f"Error listing available tasks: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True,
            },
            'body': json.dumps({'error': str(e)})
        }
