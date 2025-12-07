import json
import boto3
import os
from decimal import Decimal
from shared.config import config
from shared.models import SubmissionStatus, TaskStatus

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)
events = boto3.client('events', region_name=config.AWS_REGION)

def handler(event, context):
    """
    Handler for executing QC logic.
    Triggered by SQS (Validation Queue).
    """
    print("Received event:", json.dumps(event))

    if 'Records' in event:
        for record in event['Records']:
            if 'body' in record:
                try:
                    process_sqs_message(record)
                except Exception as e:
                    print(f"Error processing SQS record: {e}")
            elif 'dynamodb' in record:
                if record['eventName'] == 'INSERT':
                    process_stream_record(record)
        return {"message": "Processed records"}

    return {"message": "Direct invocation ignored"}

def process_sqs_message(record):
    body = json.loads(record['body'])
    submission_id = body.get('submissionId')
    task_id = body.get('taskId')
    worker_answer = body.get('answer')
    evaluate_submission(submission_id, task_id, worker_answer)

def process_stream_record(record):
    new_image = record['dynamodb']['NewImage']
    submission_id = new_image['submissionId']['S']
    task_id = new_image['taskId']['S']
    worker_answer = new_image['answer']['S']

    try:
        parsed_answer = json.loads(worker_answer)
        if isinstance(parsed_answer, str):
            worker_answer = parsed_answer
    except:
        pass

    evaluate_submission(submission_id, task_id, worker_answer)

def evaluate_submission(submission_id, task_id, worker_answer):
    tasks_table = dynamodb.Table(config.TASKS_TABLE)
    submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)

    task_resp = tasks_table.get_item(Key={'taskId': task_id})
    task = task_resp.get('Item')

    if not task:
        print(f"Task {task_id} not found")
        return

    # Mock AI QC Logic
    print(f"Running AI QC for submission {submission_id}...")

    # EventBridge Event
    try:
        events.put_events(
            Entries=[{
                'Source': 'crowdsourcing.qc',
                'DetailType': 'SubmissionQCCompleted',
                'Detail': json.dumps({
                    'submissionId': submission_id,
                    'taskId': task_id,
                    'status': 'Processed',
                    'aiConfidence': 0.95
                })
            }]
        )
        print("Sent QC event to EventBridge")
    except Exception as e:
        print(f"Failed to send EventBridge event: {e}")

    # Gold Standard Check or Auto Approve
    if task.get('isGold'):
        gold_answer = task.get('goldAnswer')
        is_correct = str(worker_answer).strip().lower() == str(gold_answer).strip().lower()
        new_status = SubmissionStatus.APPROVED if is_correct else SubmissionStatus.REJECTED
        reason = "Gold Standard Validation"

        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression="SET #status = :s, qcReason = :r",
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':s': new_status,
                ':r': reason
            }
        )
        print(f"Submission {submission_id} marked as {new_status} (Gold)")

    else:
        # Auto-approve non-gold for demo flow completion
        new_status = SubmissionStatus.APPROVED
        reason = "Auto-approved by AI QC"

        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression="SET #status = :s, qcReason = :r",
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':s': new_status,
                ':r': reason
            }
        )
        print(f"Submission {submission_id} marked as {new_status} (Auto)")
