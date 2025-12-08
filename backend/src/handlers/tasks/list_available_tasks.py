"""
List Available Tasks Handler.
Returns published tasks filtered by worker level access.
Tasks above worker's level are returned with locked=True.
"""
import json
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from shared.config import config
from shared.logging import logger, log_event
from shared.models import TaskStatus, WorkerLevel
from shared.gamification import can_access_task
from shared.auth import get_user_sub

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


class DecimalEncoder(json.JSONEncoder):
    """Custom encoder to handle Decimal types from DynamoDB."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def handler(event, context):
    log_event(event)

    try:
        tasks_table = dynamodb.Table(config.TASKS_TABLE)
        workers_table = dynamodb.Table(config.WORKERS_TABLE)

        # Get worker ID from Cognito claims
        worker_id = get_user_sub(event)
        
        # Get worker's current level (default to NOVICE if no profile)
        worker_level = WorkerLevel.NOVICE
        if worker_id:
            try:
                worker_resp = workers_table.get_item(Key={'workerId': worker_id})
                worker = worker_resp.get('Item')
                if worker:
                    worker_level = worker.get('level', WorkerLevel.NOVICE)
            except Exception as e:
                logger.warning(f"Could not fetch worker profile: {e}")

        # Query tasks with status 'Published'
        response = tasks_table.query(
            IndexName='StatusIndex',
            KeyConditionExpression=Key('status').eq(TaskStatus.PUBLISHED)
        )

        items = response.get('Items', [])

        # Process tasks: add locked flag based on level access
        processed_tasks = []
        for task in items:
            required_level = task.get('requiredLevel', WorkerLevel.NOVICE)
            has_access = can_access_task(worker_level, required_level)
            
            processed_task = {
                **task,
                'locked': not has_access,
                'requiredLevel': required_level
            }
            
            # If locked, hide sensitive details (optional)
            if not has_access:
                processed_task['lockedReason'] = f'Requires {required_level} level'
            
            processed_tasks.append(processed_task)

        # Sort: unlocked tasks first, then by createdAt
        processed_tasks.sort(key=lambda t: (t.get('locked', False), t.get('createdAt', '')))

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True,
            },
            'body': json.dumps({
                'tasks': processed_tasks,
                'workerLevel': worker_level,
                'totalTasks': len(processed_tasks),
                'unlockedTasks': len([t for t in processed_tasks if not t.get('locked')])
            }, cls=DecimalEncoder)
        }

    except Exception as e:
        logger.error(f"Error listing available tasks: {e}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True,
            },
            'body': json.dumps({'error': str(e)})
        }
