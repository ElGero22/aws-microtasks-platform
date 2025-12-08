"""
Withdraw Funds Handler - Mock PayPal withdrawal.
POST /wallet/withdraw
"""
import json
import boto3
import uuid
import time
import re
from decimal import Decimal
from botocore.exceptions import ClientError
from shared.config import config

# Withdrawal configuration
MINIMUM_WITHDRAWAL = Decimal('10.00')  # Minimum $10 to withdraw
MAXIMUM_WITHDRAWAL = Decimal('5000.00')  # Maximum $5000 per withdrawal

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)
ses = boto3.client('ses', region_name=config.AWS_REGION)


def handler(event, context):
    """
    POST /wallet/withdraw
    Body: { "amount": 50.00, "paypalEmail": "worker@email.com" }
    
    Mock withdrawal - in production this would integrate with PayPal payouts.
    """
    try:
        # Get userId from Cognito
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']

        body = json.loads(event.get('body', '{}'))
        amount = body.get('amount')
        paypal_email = body.get('paypalEmail')

        # Validation
        if amount is None:
            return response(400, {'error': 'Missing amount'})
        
        if not paypal_email:
            return response(400, {'error': 'Missing paypalEmail'})
        
        # Validate email format
        if not is_valid_email(paypal_email):
            return response(400, {'error': 'Invalid email format'})
        
        try:
            amount = Decimal(str(amount))
        except:
            return response(400, {'error': 'Invalid amount format'})
        
        if amount < MINIMUM_WITHDRAWAL:
            return response(400, {'error': f'Minimum withdrawal is ${MINIMUM_WITHDRAWAL}'})
        
        if amount > MAXIMUM_WITHDRAWAL:
            return response(400, {'error': f'Maximum withdrawal is ${MAXIMUM_WITHDRAWAL}'})

        # Execute withdrawal with atomic transaction
        timestamp = str(int(time.time()))
        transaction_id = str(uuid.uuid4())

        client = boto3.client('dynamodb', region_name=config.AWS_REGION)

        try:
            client.transact_write_items(
                TransactItems=[
                    # Deduct from wallet (with balance check)
                    {
                        'Update': {
                            'TableName': config.WALLETS_TABLE,
                            'Key': {'walletId': {'S': user_id}},
                            'UpdateExpression': 'SET balance = balance - :amount, updatedAt = :ts',
                            'ConditionExpression': 'balance >= :amount',
                            'ExpressionAttributeValues': {
                                ':amount': {'N': str(amount)},
                                ':ts': {'S': timestamp}
                            }
                        }
                    },
                    # Record withdrawal transaction
                    {
                        'Put': {
                            'TableName': config.TRANSACTIONS_TABLE,
                            'Item': {
                                'transactionId': {'S': transaction_id},
                                'type': {'S': 'WITHDRAWAL'},
                                'amount': {'N': str(amount)},
                                'from': {'S': user_id},
                                'paypalEmail': {'S': paypal_email},
                                'status': {'S': 'PENDING'},  # Would be COMPLETED after actual payout
                                'createdAt': {'S': timestamp}
                            }
                        }
                    }
                ]
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'TransactionCanceledException':
                return response(400, {'error': 'Insufficient balance'})
            raise

        # Get updated balance
        wallet_table = dynamodb.Table(config.WALLETS_TABLE)
        wallet_resp = wallet_table.get_item(Key={'walletId': user_id})
        new_balance = wallet_resp.get('Item', {}).get('balance', Decimal('0'))

        # Send notification email (mocked)
        send_withdrawal_notification(user_id, amount, paypal_email, transaction_id)

        return response(200, {
            'message': 'Withdrawal initiated successfully',
            'transactionId': transaction_id,
            'withdrawalAmount': float(amount),
            'paypalEmail': paypal_email,
            'newBalance': float(new_balance),
            'estimatedArrival': '1-3 business days (mock)'
        })

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return response(500, {'error': str(e)})


def is_valid_email(email: str) -> bool:
    """Validate email format using regex."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def send_withdrawal_notification(user_id: str, amount: Decimal, paypal_email: str, txn_id: str):
    """Send withdrawal confirmation email."""
    try:
        ses.send_email(
            Source='noreply@crowdsourcing.com',
            Destination={'ToAddresses': [paypal_email]},
            Message={
                'Subject': {'Data': 'Withdrawal Confirmed 💸'},
                'Body': {
                    'Text': {
                        'Data': (
                            f'Your withdrawal request has been processed.\n\n'
                            f'Amount: ${amount}\n'
                            f'PayPal Email: {paypal_email}\n'
                            f'Transaction ID: {txn_id}\n\n'
                            f'Estimated arrival: 1-3 business days\n\n'
                            f'Thank you for using our platform!'
                        )
                    }
                }
            }
        )
        print(f"Withdrawal notification sent to {paypal_email}")
    except Exception as e:
        print(f"SES Error (non-critical): {e}")


def response(status_code: int, body: dict):
    """Generate API Gateway response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, default=str)
    }
