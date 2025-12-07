import json
import boto3
import os
import uuid
import time
from botocore.exceptions import ClientError
from shared.config import config
from shared.models import TaskStatus

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)

def handler(event, context):
    """
    Handler for assigning a task to a worker (Locking).
    POST /worker/tasks/{taskId}/assign
    """
    try:
        task_id = event['pathParameters']['taskId']
        # Get workerId from Cognito authorizer claims
        claims = event['requestContext']['authorizer']['claims']
        worker_id = claims['sub']

        # We can set a TTL for the assignment (e.g., 10 minutes)
        expires_at = int(time.time()) + 600
        assignment_id = str(uuid.uuid4())

        tasks_table = dynamodb.Table(config.TASKS_TABLE)
        assignments_table = dynamodb.Table(config.ASSIGNMENTS_TABLE)

        # Transactional write to ensure atomicity:
        # 1. Check if Task is in 'Published' status.
        # 2. Update Task status to 'Assigned'.
        # 3. Create Assignment record.

        try:
            dynamodb.meta.client.transact_write_items(
                TransactItems=[
                    {
                        'Update': {
                            'TableName': config.TASKS_TABLE,
                            'Key': {'taskId': {'S': task_id}},
                            'UpdateExpression': 'SET #status = :assigned_status',
                            'ConditionExpression': '#status = :published_status',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {
                                ':published_status': {'S': TaskStatus.PUBLISHED},
                                ':assigned_status': {'S': 'Assigned'} # Adding Assigned to TaskStatus logic locally for now as it wasn't in models.py
                            }
                        }
                    },
                    {
                        'Put': {
                            'TableName': config.ASSIGNMENTS_TABLE,
                            'Item': {
                                'assignmentId': {'S': assignment_id},
                                'taskId': {'S': task_id},
                                'workerId': {'S': worker_id},
                                'status': {'S': 'Assigned'},
                                'expiresAt': {'N': str(expires_at)},
                                'createdAt': {'S': str(int(time.time()))}
                            },
                            # Ensure assignment doesn't already exist for this ID (unlikely with uuid)
                            'ConditionExpression': 'attribute_not_exists(assignmentId)'
                        }
                    }
                ]
            )

            return {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({
                    "message": "Task assigned successfully",
                    "assignmentId": assignment_id,
                    "expiresAt": expires_at
                })
            }

        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'TransactionCanceledException':
                # Cancellation reasons correspond to the TransactItems list order
                # We need to parse which one failed, but typically it's the ConditionCheck on Task status
                # because multiple workers might race for the same task.
                return {
                    "statusCode": 409,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": True,
                    },
                    "body": json.dumps({
                        "message": "Task is no longer available or already assigned."
                    })
                }
            else:
                raise e

    except Exception as e:
        print(f"Error assigning task: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": True,
            },
            "body": json.dumps({
                "message": "Internal Server Error"
            })
        }
