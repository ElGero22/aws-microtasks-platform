import json
import boto3
from boto3.dynamodb.conditions import Key
from shared.config import config
from shared.logging import logger, log_event
from shared.models import TaskStatus
from shared.dynamo import query, batch_write_items
from shared.sqs import send_message_batch

def handler(event, context):
    log_event(event)

    try:
        batch_id = event['pathParameters']['batchId']
    except (KeyError, TypeError):
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing batchId'})
        }

    # Query tasks by batchId
    # We need to use Key('batchId').eq(batch_id)
    # We import Key from boto3.dynamodb.conditions

    tasks = query(
        config.TASKS_TABLE,
        IndexName='BatchIndex',
        KeyConditionExpression=Key('batchId').eq(batch_id)
    )

    if not tasks:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Batch not found or empty'})
        }

    updated_tasks = []
    sqs_entries = []

    for task in tasks:
        # Only publish created tasks
        if task.get('status') == TaskStatus.CREATED:
            task['status'] = TaskStatus.PUBLISHED
            updated_tasks.append(task)

            sqs_entries.append({
                'Id': task['taskId'],
                'MessageBody': json.dumps({
                    'taskId': task['taskId'],
                    'type': task.get('type'),
                    'batchId': batch_id
                })
            })

    if not updated_tasks:
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'No tasks to publish (already published?)'})
        }

    # Update DynamoDB
    # Note: batch_write_items uses PutItem, so it overwrites.
    # Since we queried the full item and modified status, this is effectively an update.
    db_success = batch_write_items(config.TASKS_TABLE, updated_tasks)

    if not db_success:
         return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Failed to update tasks status'})
        }

    # Send to SQS
    sqs_success = send_message_batch(config.AVAILABLE_TASKS_QUEUE_URL, sqs_entries)

    if not sqs_success:
        # If SQS fails, we might want to revert DB or mark as error.
        # For MVP, just log error.
        logger.error("Failed to send messages to SQS")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Tasks published to DB but failed to enqueue'})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Published {len(updated_tasks)} tasks',
            'batchId': batch_id
        })
    }
