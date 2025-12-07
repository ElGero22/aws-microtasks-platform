import json
import boto3
import os
import time
import uuid
from botocore.exceptions import ClientError
from shared.config import config
from shared.models import TaskStatus, SubmissionStatus

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)
sqs = boto3.client('sqs', region_name=config.AWS_REGION)

def handler(event, context):
    """
    Handler for submitting work for a task.
    POST /worker/tasks/{taskId}/submit
    Body: { "assignmentId": "...", "answer": "..." }
    """
    try:
        task_id = event['pathParameters']['taskId']

        # Get workerId from Cognito authorizer claims
        claims = event['requestContext']['authorizer']['claims']
        worker_id = claims['sub']

        body = json.loads(event.get('body', '{}'))
        assignment_id = body.get('assignmentId')
        answer = body.get('answer')

        if not assignment_id or not answer:
             return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({
                    "message": "Missing assignmentId or answer"
                })
            }

        tasks_table = dynamodb.Table(config.TASKS_TABLE)
        assignments_table = dynamodb.Table(config.ASSIGNMENTS_TABLE)
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)

        # Verify assignment
        # We need to check:
        # 1. Assignment exists
        # 2. Assignment belongs to this worker
        # 3. Assignment is for this task
        # 4. Assignment is active (not expired) and status is 'Assigned'

        assignment = assignments_table.get_item(Key={'assignmentId': assignment_id})
        item = assignment.get('Item')

        if not item:
            return {
                "statusCode": 404,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({"message": "Assignment not found"})
            }

        if item.get('workerId') != worker_id:
             return {
                "statusCode": 403,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({"message": "Not authorized for this assignment"})
            }

        if item.get('taskId') != task_id:
             return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({"message": "Assignment does not match task"})
            }

        current_time = int(time.time())
        if current_time > int(item.get('expiresAt', 0)):
             return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({"message": "Assignment expired"})
            }

        if item.get('status') != 'Assigned':
             return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({"message": "Assignment is not active"})
            }

        submission_id = str(uuid.uuid4()) # Need to import uuid

        # Transactional write:
        # 1. Create Submission
        # 2. Update Assignment status to 'Submitted'
        # 3. Update Task status to 'Review' (or trigger QC)

        try:
            dynamodb.meta.client.transact_write_items(
                TransactItems=[
                    {
                        'Put': {
                            'TableName': config.SUBMISSIONS_TABLE,
                            'Item': {
                                'submissionId': {'S': submission_id},
                                'taskId': {'S': task_id},
                                'workerId': {'S': worker_id},
                                'assignmentId': {'S': assignment_id},
                                'status': {'S': SubmissionStatus.PENDING},
                                'answer': {'S': json.dumps(answer) if isinstance(answer, (dict, list)) else str(answer)},
                                'createdAt': {'S': str(current_time)}
                            }
                        }
                    },
                    {
                        'Update': {
                            'TableName': config.ASSIGNMENTS_TABLE,
                            'Key': {'assignmentId': {'S': assignment_id}},
                            'UpdateExpression': 'SET #status = :submitted_status',
                            'ConditionExpression': '#status = :assigned_status',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {
                                ':assigned_status': {'S': 'Assigned'},
                                ':submitted_status': {'S': 'Submitted'}
                            }
                        }
                    },
                    {
                        'Update': {
                            'TableName': config.TASKS_TABLE,
                            'Key': {'taskId': {'S': task_id}},
                            'UpdateExpression': 'SET #status = :review_status',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {
                                ':review_status': {'S': 'Review'} # Or whatever status implies QC needed
                            }
                        }
                    }
                ]
            )

            if config.SUBMISSION_QUEUE_URL:
                sqs.send_message(
                    QueueUrl=config.SUBMISSION_QUEUE_URL,
                    MessageBody=json.dumps({
                        'submissionId': submission_id,
                        'taskId': task_id,
                        'workerId': worker_id,
                        'assignmentId': assignment_id,
                        'answer': answer
                    })
                )

            return {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({
                    "message": "Work submitted successfully",
                    "submissionId": submission_id
                })
            }

        except ClientError as e:
            print(f"Transaction error: {e}")
            return {
                "statusCode": 500,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": True,
                },
                "body": json.dumps({
                    "message": "Failed to save submission"
                })
            }

    except Exception as e:
        print(f"Error submitting work: {str(e)}")
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
