"""
Payment Processing Handler with Platform Fee.
Triggered by DynamoDB Stream on Submissions Table.
Implements 20% platform fee on all task payments.
"""
import json
import boto3
import uuid
import time
from decimal import Decimal, ROUND_DOWN
from botocore.exceptions import ClientError
from shared.config import config

# Platform configuration
PLATFORM_FEE_PERCENT = Decimal('0.20')  # 20% platform fee
PLATFORM_WALLET_ID = 'PLATFORM_WALLET'  # Reserved wallet ID for platform earnings

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)
ses = boto3.client('ses', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Handler triggered by DynamoDB Stream on Submissions Table.
    Listens for MODIFY events where status changes to 'Approved'.
    """
    print("Received event:", json.dumps(event))

    if 'Records' not in event:
        return {'processed': 0}

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

    return {'processed': processed}


def process_record(record) -> bool:
    """Process a single stream record. Returns True if payment was executed."""
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
        return True
    
    return False


def calculate_payment_split(total_price: Decimal) -> tuple:
    """
    Calculate the payment split between worker and platform.
    
    Args:
        total_price: The full task reward amount
        
    Returns:
        tuple: (worker_amount, platform_fee)
    """
    platform_fee = (total_price * PLATFORM_FEE_PERCENT).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
    worker_amount = total_price - platform_fee
    return worker_amount, platform_fee


def execute_payment(submission_id: str, task_id: str, worker_id: str):
    """
    Execute payment with 20% platform fee.
    
    Flow:
    1. Deduct full price from Requester wallet
    2. Add 80% to Worker wallet
    3. Add 20% to Platform wallet
    4. Record all transactions
    """
    tasks_table = dynamodb.Table(config.TASKS_TABLE)

    # 1. Get Task Details (Price & Requester)
    task_resp = tasks_table.get_item(Key={'taskId': task_id})
    task = task_resp.get('Item')

    if not task:
        print(f"Task {task_id} not found")
        return

    requester_id = task.get('requesterId')
    # Default price if not set, e.g., $0.50
    total_price = Decimal(str(task.get('payload', {}).get('reward', 0.5)))
    
    # Calculate split
    worker_amount, platform_fee = calculate_payment_split(total_price)

    print(f"Processing payment: ${total_price} total")
    print(f"  - Worker ({worker_id}): ${worker_amount} (80%)")
    print(f"  - Platform fee: ${platform_fee} (20%)")
    print(f"  - From requester: {requester_id}")

    # 2. Atomic Transaction: Move funds
    timestamp = str(int(time.time()))
    worker_txn_id = str(uuid.uuid4())
    fee_txn_id = str(uuid.uuid4())

    client = boto3.client('dynamodb', region_name=config.AWS_REGION)

    try:
        client.transact_write_items(
            TransactItems=[
                # Deduct FULL price from Requester
                {
                    'Update': {
                        'TableName': config.WALLETS_TABLE,
                        'Key': {'walletId': {'S': requester_id}},
                        'UpdateExpression': 'SET balance = balance - :amount',
                        'ConditionExpression': 'balance >= :amount',
                        'ExpressionAttributeValues': {
                            ':amount': {'N': str(total_price)}
                        }
                    }
                },
                # Add 80% to Worker
                {
                    'Update': {
                        'TableName': config.WALLETS_TABLE,
                        'Key': {'walletId': {'S': worker_id}},
                        'UpdateExpression': 'ADD balance :amount',
                        'ExpressionAttributeValues': {
                            ':amount': {'N': str(worker_amount)}
                        }
                    }
                },
                # Add 20% to Platform Wallet
                {
                    'Update': {
                        'TableName': config.WALLETS_TABLE,
                        'Key': {'walletId': {'S': PLATFORM_WALLET_ID}},
                        'UpdateExpression': 'ADD balance :amount',
                        'ExpressionAttributeValues': {
                            ':amount': {'N': str(platform_fee)}
                        }
                    }
                },
                # Record Worker Payment Transaction
                {
                    'Put': {
                        'TableName': config.TRANSACTIONS_TABLE,
                        'Item': {
                            'transactionId': {'S': worker_txn_id},
                            'type': {'S': 'TASK_PAYMENT'},
                            'amount': {'N': str(worker_amount)},
                            'grossAmount': {'N': str(total_price)},
                            'platformFee': {'N': str(platform_fee)},
                            'from': {'S': requester_id},
                            'to': {'S': worker_id},
                            'referenceId': {'S': submission_id},
                            'taskId': {'S': task_id},
                            'createdAt': {'S': timestamp}
                        }
                    }
                },
                # Record Platform Fee Transaction
                {
                    'Put': {
                        'TableName': config.TRANSACTIONS_TABLE,
                        'Item': {
                            'transactionId': {'S': fee_txn_id},
                            'type': {'S': 'PLATFORM_FEE'},
                            'amount': {'N': str(platform_fee)},
                            'from': {'S': requester_id},
                            'to': {'S': PLATFORM_WALLET_ID},
                            'referenceId': {'S': submission_id},
                            'taskId': {'S': task_id},
                            'createdAt': {'S': timestamp}
                        }
                    }
                }
            ]
        )
        print(f"Payment successful!")
        print(f"  - Worker transaction: {worker_txn_id}")
        print(f"  - Fee transaction: {fee_txn_id}")

        # Send Notification via SES
        send_payment_notification(worker_id, worker_amount, task_id, platform_fee)

    except ClientError as e:
        if e.response['Error']['Code'] == 'TransactionCanceledException':
            print(f"Payment failed: Insufficient funds or wallet locked.")
            print(f"Detail: {e.response}")
            # Mark submission as payment failed
            mark_payment_failed(submission_id)
        else:
            print(f"Payment error: {e}")
            raise e


def send_payment_notification(worker_id: str, amount: Decimal, task_id: str, fee: Decimal):
    """Send payment notification email to worker."""
    try:
        ses.send_email(
            Source='noreply@crowdsourcing.com',
            Destination={'ToAddresses': ['worker@example.com']},  # Mocked email
            Message={
                'Subject': {'Data': 'Payment Received! 💰'},
                'Body': {
                    'Text': {
                        'Data': (
                            f'Great news! You have received ${amount} for completing task {task_id}.\n\n'
                            f'Note: A platform fee of ${fee} (20%) was deducted from the original reward.\n\n'
                            f'Thank you for using our platform!'
                        )
                    }
                }
            }
        )
        print(f"Payment notification sent to worker {worker_id}")
    except Exception as e:
        print(f"SES Error (non-critical): {e}")


def mark_payment_failed(submission_id: str):
    """Mark a submission as having a failed payment."""
    try:
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression='SET paymentStatus = :status, paymentError = :error',
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':error': 'Insufficient funds in requester wallet'
            }
        )
        print(f"Marked submission {submission_id} as payment failed")
    except Exception as e:
        print(f"Error marking payment failed: {e}")
