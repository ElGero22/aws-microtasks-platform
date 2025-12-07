import json
import boto3
import os
import uuid
import time
from decimal import Decimal
from botocore.exceptions import ClientError
from shared.config import config

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)
ses = boto3.client('ses', region_name=config.AWS_REGION)

def handler(event, context):
    """
    Handler triggered by DynamoDB Stream on Submissions Table.
    Listens for MODIFY events where status changes to 'Approved'.
    """
    print("Received event:", json.dumps(event))

    if 'Records' not in event:
        return

    for record in event['Records']:
        if record['eventName'] == 'MODIFY':
            try:
                process_record(record)
            except Exception as e:
                print(f"Error processing record: {e}")

def process_record(record):
    new_image = record['dynamodb']['NewImage']
    old_image = record['dynamodb']['OldImage']

    new_status = new_image.get('status', {}).get('S')
    old_status = old_image.get('status', {}).get('S')

    # Only process if status CHANGED to 'Approved'
    # This prevents double payment if the record is updated for other reasons later
    if new_status == 'Approved' and old_status != 'Approved':
        submission_id = new_image['submissionId']['S']
        worker_id = new_image['workerId']['S']
        task_id = new_image['taskId']['S']

        execute_payment(submission_id, task_id, worker_id)

def execute_payment(submission_id, task_id, worker_id):
    # Use resource for easy reading
    tasks_table = dynamodb.Table(config.TASKS_TABLE)

    # 1. Get Task Details (Price & Requester)
    task_resp = tasks_table.get_item(Key={'taskId': task_id})
    task = task_resp.get('Item')

    if not task:
        print(f"Task {task_id} not found")
        return

    requester_id = task.get('requesterId')
    # Default price if not set, e.g., $0.50
    price = Decimal(str(task.get('payload', {}).get('reward', 0.5)))

    print(f"Processing payment of ${price} from {requester_id} to {worker_id}")

    # 2. Atomic Transaction: Move funds
    timestamp = str(int(time.time()))
    transaction_id = str(uuid.uuid4())

    # Use a fresh client to ensure correct session/mocking interaction and clean low-level access
    client = boto3.client('dynamodb', region_name=config.AWS_REGION)

    try:
        client.transact_write_items(
            TransactItems=[
                # Deduct from Requester
                {
                    'Update': {
                        'TableName': config.WALLETS_TABLE,
                        'Key': {'walletId': {'S': requester_id}},
                        'UpdateExpression': 'SET balance = balance - :amount',
                        'ConditionExpression': 'balance >= :amount',
                        'ExpressionAttributeValues': {
                            ':amount': {'N': str(price)}
                        }
                    }
                },
                # Add to Worker
                {
                    'Update': {
                        'TableName': config.WALLETS_TABLE,
                        'Key': {'walletId': {'S': worker_id}},
                        'UpdateExpression': 'ADD balance :amount',
                        'ExpressionAttributeValues': {
                            ':amount': {'N': str(price)}
                        }
                    }
                },
                # Record Transaction
                {
                    'Put': {
                        'TableName': config.TRANSACTIONS_TABLE,
                        'Item': {
                            'transactionId': {'S': transaction_id},
                            'type': {'S': 'TASK_PAYMENT'},
                            'amount': {'N': str(price)},
                            'from': {'S': requester_id},
                            'to': {'S': worker_id},
                            'referenceId': {'S': submission_id},
                            'createdAt': {'S': timestamp}
                        }
                    }
                }
            ]
        )
        print(f"Payment successful: {transaction_id}")

        # Send Notification via SES
        try:
            ses.send_email(
                Source='noreply@crowdsourcing.com',
                Destination={'ToAddresses': ['worker@example.com']}, # Mocked email
                Message={
                    'Subject': {'Data': 'Payment Received'},
                    'Body': {
                        'Text': {'Data': f'You have received ${price} for task {task_id}.'}
                    }
                }
            )
        except Exception as e:
            print(f"SES Error: {e}")

    except ClientError as e:
        if e.response['Error']['Code'] == 'TransactionCanceledException':
            print(f"Payment failed: Insufficient funds or wallet locked. Detail: {e.response}")
            # TODO: Mark submission as 'PaymentFailed' or Notify Admin
        else:
            print(f"Payment error: {e}")
            raise e
