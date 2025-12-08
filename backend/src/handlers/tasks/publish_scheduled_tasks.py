"""
Publish Scheduled Tasks Handler.
Triggered by EventBridge scheduler to publish tasks with scheduled publishAt time.
"""
import json
import boto3
import time
from datetime import datetime, timezone
from shared.config import config
from shared.models import TaskStatus

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Scheduled handler to publish tasks with passed publishAt time.
    Should be triggered every 1 minute by EventBridge.
    """
    print(f"Running scheduled task publishing check...")
    
    tasks_table = dynamodb.Table(config.TASKS_TABLE)
    
    # Current timestamp
    now_ts = str(int(time.time()))
    
    # Scan for scheduled tasks that should be published now
    # In production, use a GSI on status + publishAt for efficiency
    response = tasks_table.scan(
        FilterExpression='#status = :scheduled AND publishAt <= :now',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':scheduled': TaskStatus.SCHEDULED,
            ':now': now_ts
        }
    )
    
    tasks_to_publish = response.get('Items', [])
    print(f"Found {len(tasks_to_publish)} tasks ready to publish")
    
    published_count = 0
    
    for task in tasks_to_publish:
        try:
            task_id = task['taskId']
            
            # Update task status to Published
            tasks_table.update_item(
                Key={'taskId': task_id},
                UpdateExpression='SET #status = :published, publishedAt = :ts',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':published': TaskStatus.PUBLISHED,
                    ':ts': now_ts
                }
            )
            
            print(f"Published scheduled task {task_id}")
            published_count += 1
            
        except Exception as e:
            print(f"Error publishing task {task.get('taskId')}: {e}")
    
    return {
        'checked': len(tasks_to_publish),
        'published': published_count
    }
