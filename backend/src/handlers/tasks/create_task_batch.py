import json
import uuid
import datetime
from shared.config import config
from shared.logging import logger, log_event
from shared.auth import get_user_sub
from shared.models import TaskStatus
from shared.dynamo import batch_write_items

def handler(event, context):
    log_event(event)

    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid JSON'})
        }

    requester_id = get_user_sub(event)
    if not requester_id:
        requester_id = body.get('requesterId', 'demo-requester')

    tasks_data = body.get('tasks', [])
    if not tasks_data:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'No tasks provided'})
        }

    batch_id = str(uuid.uuid4())
    # Use timezone-aware datetime
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    items_to_write = []

    for task_input in tasks_data:
        task_id = str(uuid.uuid4())
        # Logic: if goldAnswer is present and truthy, it is gold. Or if isGold is explicitly true.
        is_gold = task_input.get('isGold', False)
        gold_answer = task_input.get('goldAnswer')

        if gold_answer:
            is_gold = True

        item = {
            'taskId': task_id,
            'requesterId': requester_id,
            'batchId': batch_id,
            'status': TaskStatus.CREATED,
            'type': task_input.get('type', 'generic'),
            'payload': task_input.get('payload', {}),
            'createdAt': timestamp,
            'isGold': is_gold
        }

        # Only add goldAnswer if it exists (not None)
        if is_gold and gold_answer is not None:
            item['goldAnswer'] = gold_answer

        items_to_write.append(item)

    success = batch_write_items(config.TASKS_TABLE, items_to_write)

    if not success:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Failed to save tasks'})
        }

    return {
        'statusCode': 201,
        'body': json.dumps({
            'message': f'Created {len(items_to_write)} tasks',
            'batchId': batch_id,
            'requesterId': requester_id
        })
    }
