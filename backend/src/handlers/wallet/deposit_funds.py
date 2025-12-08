"""
Deposit Funds Handler - Mock payment deposit.
POST /wallet/deposit
"""
import json
import boto3
import uuid
import time
from decimal import Decimal
from shared.config import config

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    POST /wallet/deposit
    Body: { "amount": 100.00 }
    
    Mock deposit - in production this would integrate with Stripe/PayPal.
    """
    try:
        # Get userId from Cognito
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']

        body = json.loads(event.get('body', '{}'))
        amount = body.get('amount')

        # Validation
        if amount is None:
            return response(400, {'error': 'Missing amount'})
        
        try:
            amount = Decimal(str(amount))
        except:
            return response(400, {'error': 'Invalid amount format'})
        
        if amount <= 0:
            return response(400, {'error': 'Amount must be positive'})
        
        if amount > 10000:
            return response(400, {'error': 'Maximum deposit is $10,000'})

        # Execute deposit
        wallet_table = dynamodb.Table(config.WALLETS_TABLE)
        transactions_table = dynamodb.Table(config.TRANSACTIONS_TABLE)
        
        timestamp = str(int(time.time()))
        transaction_id = str(uuid.uuid4())

        # Update wallet balance (upsert)
        wallet_table.update_item(
            Key={'walletId': user_id},
            UpdateExpression='ADD balance :amount SET updatedAt = :ts',
            ExpressionAttributeValues={
                ':amount': amount,
                ':ts': timestamp
            }
        )

        # Record transaction
        transactions_table.put_item(
            Item={
                'transactionId': transaction_id,
                'type': 'DEPOSIT',
                'amount': amount,
                'to': user_id,
                'status': 'COMPLETED',
                'paymentMethod': 'MOCK',
                'createdAt': timestamp
            }
        )

        # Get updated balance
        wallet_resp = wallet_table.get_item(Key={'walletId': user_id})
        new_balance = wallet_resp.get('Item', {}).get('balance', Decimal('0'))

        return response(200, {
            'message': 'Deposit successful',
            'transactionId': transaction_id,
            'depositedAmount': float(amount),
            'newBalance': float(new_balance)
        })

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return response(500, {'error': str(e)})


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
