"""
Expire Assignments Handler.
Triggered by EventBridge scheduler every minute to expire stale assignments.
"""
import json
import boto3
import time
from datetime import datetime, timezone, timedelta
from shared.config import config
from shared.models import TaskStatus, AssignmentStatus

# Assignment expires after this many minutes
ASSIGNMENT_TIMEOUT_MINUTES = 10

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Scheduled handler to expire old task assignments.
    Should be triggered every 1-5 minutes by EventBridge.
    
    When an assignment expires:
    1. Assignment status -> 'Expired'
    2. Task status -> 'Published' (re-released to pool)
    3. Task assignedTo -> null
    """
    print(f"Running assignment expiration check...")
    
    assignments_table = dynamodb.Table(config.ASSIGNMENTS_TABLE)
    tasks_table = dynamodb.Table(config.TASKS_TABLE)
    
    # Calculate cutoff timestamp
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ASSIGNMENT_TIMEOUT_MINUTES)
    cutoff_ts = str(int(cutoff.timestamp()))
    
    # Scan for assigned (active) assignments older than timeout
    # In production, use GSI on status + createdAt for efficiency
    response = assignments_table.scan(
        FilterExpression='#status = :assigned AND createdAt < :cutoff',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':assigned': AssignmentStatus.ASSIGNED,
            ':cutoff': cutoff_ts
        }
    )
    
    stale_assignments = response.get('Items', [])
    print(f"Found {len(stale_assignments)} stale assignments older than {ASSIGNMENT_TIMEOUT_MINUTES} min")
    
    expired_count = 0
    timestamp = str(int(time.time()))
    
    for assignment in stale_assignments:
        try:
            assignment_id = assignment['assignmentId']
            task_id = assignment['taskId']
            worker_id = assignment.get('workerId', 'unknown')
            
            # Use transaction to ensure atomicity
            client = boto3.client('dynamodb', region_name=config.AWS_REGION)
            
            client.transact_write_items(
                TransactItems=[
                    # Expire the assignment
                    {
                        'Update': {
                            'TableName': config.ASSIGNMENTS_TABLE,
                            'Key': {'assignmentId': {'S': assignment_id}},
                            'UpdateExpression': 'SET #status = :expired, expiredAt = :ts',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {
                                ':expired': {'S': AssignmentStatus.EXPIRED},
                                ':ts': {'S': timestamp}
                            }
                        }
                    },
                    # Re-release the task
                    {
                        'Update': {
                            'TableName': config.TASKS_TABLE,
                            'Key': {'taskId': {'S': task_id}},
                            'UpdateExpression': 'SET #status = :published, assignedTo = :null, assignedAt = :null',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {
                                ':published': {'S': TaskStatus.PUBLISHED},
                                ':null': {'NULL': True}
                            }
                        }
                    }
                ]
            )
            
            print(f"Expired assignment {assignment_id} (task: {task_id}, worker: {worker_id})")
            expired_count += 1
            
        except Exception as e:
            print(f"Error processing assignment {assignment.get('assignmentId')}: {e}")
    
    return {
        'checked': len(stale_assignments),
        'expired': expired_count
    }
