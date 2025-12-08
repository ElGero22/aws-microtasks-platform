"""
Update Worker Stats Handler.
Triggered by DynamoDB Streams on SubmissionsTable.
Updates worker gamification metrics when submissions are approved/rejected.
"""
import json
import boto3
from decimal import Decimal
from datetime import datetime, timezone
from shared.config import config
from shared.models import SubmissionStatus, WorkerLevel
from shared.gamification import calculate_level

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Handler triggered by DynamoDB Stream on Submissions Table.
    Listens for MODIFY events where status changes to 'Approved' or 'Rejected'.
    """
    print("Received event:", json.dumps(event))

    if 'Records' not in event:
        return {'message': 'No records to process'}

    processed = 0
    for record in event['Records']:
        if record['eventName'] == 'MODIFY':
            try:
                if process_record(record):
                    processed += 1
            except Exception as e:
                print(f"Error processing record: {e}")
                import traceback
                traceback.print_exc()

    return {'message': f'Processed {processed} records'}


def process_record(record) -> bool:
    """
    Process a single DynamoDB Stream record.
    Returns True if stats were updated, False otherwise.
    """
    new_image = record['dynamodb']['NewImage']
    old_image = record['dynamodb']['OldImage']

    new_status = new_image.get('status', {}).get('S')
    old_status = old_image.get('status', {}).get('S')

    # Only process if status CHANGED to 'Approved' or 'Rejected'
    # Avoid processing the same status change twice
    if new_status == old_status:
        return False

    # Check if this is a final status (Approved/Rejected)
    worker_id = new_image.get('workerId', {}).get('S')
    
    if not worker_id:
        print("No workerId found in record")
        return False

    if new_status == SubmissionStatus.APPROVED:
        update_worker_stats(worker_id, is_approved=True)
        return True
    elif new_status == SubmissionStatus.REJECTED:
        update_worker_stats(worker_id, is_approved=False)
        return True
    
    return False


def update_worker_stats(worker_id: str, is_approved: bool):
    """
    Update worker statistics and recalculate level.
    Uses atomic operations to prevent race conditions.
    
    Args:
        worker_id: The worker's ID
        is_approved: True if submission was approved, False if rejected
    """
    workers_table = dynamodb.Table(config.WORKERS_TABLE)
    timestamp = datetime.now(timezone.utc).isoformat()

    # First, atomically increment counters
    if is_approved:
        update_expr = 'ADD tasksSubmitted :one, tasksApproved :one SET updatedAt = :ts'
    else:
        update_expr = 'ADD tasksSubmitted :one SET updatedAt = :ts'

    try:
        # Use UpdateItem with ADD to atomically increment
        # This also creates the item if it doesn't exist (upsert)
        response = workers_table.update_item(
            Key={'workerId': worker_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues={
                ':one': 1,
                ':ts': timestamp
            },
            ReturnValues='ALL_NEW'
        )

        updated_item = response.get('Attributes', {})
        tasks_submitted = int(updated_item.get('tasksSubmitted', 0))
        tasks_approved = int(updated_item.get('tasksApproved', 0))

        print(f"Updated worker {worker_id}: submitted={tasks_submitted}, approved={tasks_approved}")

        # Calculate accuracy and level
        if tasks_submitted > 0:
            accuracy = tasks_approved / tasks_submitted
        else:
            accuracy = 0.0

        new_level = calculate_level(accuracy, tasks_submitted)
        current_level = updated_item.get('level', WorkerLevel.NOVICE)

        # Update accuracy and level
        workers_table.update_item(
            Key={'workerId': worker_id},
            UpdateExpression='SET accuracy = :acc, #lvl = :level, updatedAt = :ts',
            ExpressionAttributeNames={'#lvl': 'level'},
            ExpressionAttributeValues={
                ':acc': Decimal(str(round(accuracy, 4))),
                ':level': new_level,
                ':ts': timestamp
            }
        )

        # Log level changes
        if current_level != new_level:
            print(f"Worker {worker_id} LEVELED UP: {current_level} -> {new_level}!")
            # TODO: Could emit an EventBridge event for notifications/badges

        print(f"Worker {worker_id} stats updated: accuracy={accuracy:.2%}, level={new_level}")

    except Exception as e:
        print(f"Error updating worker stats for {worker_id}: {e}")
        raise


def initialize_worker_profile(worker_id: str):
    """
    Initialize a new worker profile with default values.
    Only creates if not exists.
    
    Args:
        worker_id: The worker's ID
    """
    workers_table = dynamodb.Table(config.WORKERS_TABLE)
    timestamp = datetime.now(timezone.utc).isoformat()

    try:
        workers_table.put_item(
            Item={
                'workerId': worker_id,
                'level': WorkerLevel.NOVICE,
                'tasksSubmitted': 0,
                'tasksApproved': 0,
                'accuracy': Decimal('0'),
                'createdAt': timestamp,
                'updatedAt': timestamp
            },
            ConditionExpression='attribute_not_exists(workerId)'
        )
        print(f"Created new worker profile for {worker_id}")
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        print(f"Worker profile already exists for {worker_id}")
