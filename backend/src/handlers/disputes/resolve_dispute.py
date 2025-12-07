import json
import boto3
import time
from shared.config import config
from shared.models import SubmissionStatus

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)

def handler(event, context):
    """
    POST /admin/disputes/{disputeId}/resolve
    Body: { "resolution": "Approve" | "Reject", "adminNote": "..." }
    """
    try:
        dispute_id = event['pathParameters']['disputeId']

        # In real app, verify Admin role here

        body = json.loads(event.get('body', '{}'))
        resolution = body.get('resolution') # 'Approve' or 'Reject'
        note = body.get('adminNote', '')

        if resolution not in ['Approve', 'Reject']:
            return {"statusCode": 400, "body": json.dumps({"message": "Invalid resolution"})}

        disputes_table = dynamodb.Table(config.DISPUTES_TABLE)
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)

        # Get Dispute to find submissionId
        disp_resp = disputes_table.get_item(Key={'disputeId': dispute_id})
        dispute = disp_resp.get('Item')

        if not dispute:
            return {"statusCode": 404, "body": json.dumps({"message": "Dispute not found"})}

        submission_id = dispute.get('submissionId')

        # Determine new submission status
        new_sub_status = SubmissionStatus.APPROVED if resolution == 'Approve' else SubmissionStatus.REJECTED_FINAL

        try:
            dynamodb.meta.client.transact_write_items(
                TransactItems=[
                    {
                        'Update': {
                            'TableName': config.DISPUTES_TABLE,
                            'Key': {'disputeId': {'S': dispute_id}},
                            'UpdateExpression': 'SET #status = :s, resolution = :r, adminNote = :n, resolvedAt = :t',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {
                                ':s': {'S': 'Resolved'},
                                ':r': {'S': resolution},
                                ':n': {'S': note},
                                ':t': {'S': str(int(time.time()))}
                            }
                        }
                    },
                    {
                        'Update': {
                            'TableName': config.SUBMISSIONS_TABLE,
                            'Key': {'submissionId': {'S': submission_id}},
                            'UpdateExpression': 'SET #status = :s',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {':s': {'S': new_sub_status}}
                        }
                    }
                ]
            )

            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"message": f"Dispute resolved as {resolution}"})
            }

        except Exception as e:
            print(f"Error: {e}")
            raise e

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"message": str(e)})}
