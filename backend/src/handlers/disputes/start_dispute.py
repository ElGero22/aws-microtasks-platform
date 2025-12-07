import json
import boto3
import uuid
import time
from shared.config import config
from shared.models import SubmissionStatus

# Create resource at module level (standard pattern)
dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)
sfn = boto3.client('stepfunctions', region_name=config.AWS_REGION)

def handler(event, context):
    """
    POST /worker/disputes
    Body: { "submissionId": "...", "reason": "..." }
    """
    try:
        # Get workerId from Cognito
        claims = event['requestContext']['authorizer']['claims']
        worker_id = claims['sub']

        body = json.loads(event.get('body', '{}'))
        submission_id = body.get('submissionId')
        reason = body.get('reason')

        if not submission_id or not reason:
            return {"statusCode": 400, "body": json.dumps({"message": "Missing fields"})}

        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
        disputes_table = dynamodb.Table(config.DISPUTES_TABLE)

        # 1. Verify Submission exists, belongs to worker, and is Rejected
        sub_resp = submissions_table.get_item(Key={'submissionId': submission_id})
        submission = sub_resp.get('Item')

        if not submission:
            return {"statusCode": 404, "body": json.dumps({"message": "Submission not found"})}

        if submission.get('workerId') != worker_id:
            return {"statusCode": 403, "body": json.dumps({"message": "Unauthorized"})}

        if submission.get('status') != SubmissionStatus.REJECTED:
            return {"statusCode": 400, "body": json.dumps({"message": "Can only dispute rejected submissions"})}

        dispute_id = str(uuid.uuid4())
        timestamp = str(int(time.time()))

        # 2. Create Dispute & Update Submission (Atomic)
        try:
            # Use client from the resource
            client = dynamodb.meta.client

            client.transact_write_items(
                TransactItems=[
                    {
                        'Put': {
                            'TableName': config.DISPUTES_TABLE,
                            'Item': {
                                'disputeId': {'S': dispute_id},
                                'submissionId': {'S': submission_id},
                                'workerId': {'S': worker_id},
                                'reason': {'S': reason},
                                'status': {'S': 'Open'},
                                'createdAt': {'S': timestamp}
                            }
                        }
                    },
                    {
                        'Update': {
                            'TableName': config.SUBMISSIONS_TABLE,
                            'Key': {'submissionId': {'S': submission_id}},
                            'UpdateExpression': 'SET #status = :d',
                            'ExpressionAttributeNames': {'#status': 'status'},
                            'ExpressionAttributeValues': {':d': {'S': SubmissionStatus.DISPUTED}}
                        }
                    }
                ]
            )

            # Trigger Step Function
            sfn_arn = config.DISPUTE_STATE_MACHINE_ARN
            if sfn_arn:
                try:
                    sfn.start_execution(
                        stateMachineArn=sfn_arn,
                        name=dispute_id,
                        input=json.dumps({'disputeId': dispute_id, 'submissionId': submission_id})
                    )
                except Exception as ex:
                    print(f"Failed to start step function: {ex}")

            return {
                "statusCode": 201,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"message": "Dispute opened", "disputeId": dispute_id})
            }

        except Exception as e:
            print(f"Transact error: {e}")
            return {"statusCode": 500, "body": json.dumps({"message": "Failed to open dispute"})}

    except Exception as e:
        print(f"Error: {e}")
        return {"statusCode": 500, "body": json.dumps({"message": str(e)})}
