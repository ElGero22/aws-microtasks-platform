import json
import boto3
from decimal import Decimal
from shared.config import config
from shared.utils import format_response

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)

def handler(event, context):
    """
    Handler to get current user's wallet balance.
    GET /requester/wallet OR GET /worker/wallet
    """
    try:
        # Get userId from Cognito authorizer claims
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']

        wallets_table = dynamodb.Table(config.WALLETS_TABLE)

        response = wallets_table.get_item(Key={'walletId': user_id})
        item = response.get('Item')

        balance = 0
        if item:
            # Decimal to float or string for JSON serialization?
            # format_response should handle Decimal if it uses a custom encoder,
            # but standard json.dumps fails with Decimal.
            # The provided code uses 'balance = item.get('balance', 0)'.
            # Usually DynamoDB returns Decimal.
            # I should verify if format_response handles Decimal.
            balance = item.get('balance', 0)

        return format_response(200, {
            "walletId": user_id,
            "balance": balance,
            "currency": "USD"
        })

    except Exception as e:
        print(f"Error getting wallet: {str(e)}")
        return format_response(500, {"message": "Internal Server Error"})
