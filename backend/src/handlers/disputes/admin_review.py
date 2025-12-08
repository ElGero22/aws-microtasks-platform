"""
Admin Review Dispute Handler - Called by Step Functions.
"""
import json
import boto3
import time
from shared.config import config
from shared.models import SubmissionStatus, DisputeStatus

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Handler for admin to resolve disputes.
    Can be called via API or by Step Functions task.
    
    Input (from Step Functions or API):
    {
        "disputeId": "...",
        "decision": "APPROVE" | "REJECT" | "PARTIAL",
        "adminNotes": "Optional notes"
    }
    """
    try:
        dispute_id = event.get('disputeId')
        decision = event.get('decision', '').upper()
        admin_notes = event.get('adminNotes', '')

        if not dispute_id:
            return {'error': 'Missing disputeId'}
        
        if decision not in ['APPROVE', 'REJECT', 'PARTIAL']:
            return {'error': 'Invalid decision. Must be APPROVE, REJECT, or PARTIAL'}

        disputes_table = dynamodb.Table(config.DISPUTES_TABLE)
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)

        # Get dispute
        dispute_resp = disputes_table.get_item(Key={'disputeId': dispute_id})
        dispute = dispute_resp.get('Item')

        if not dispute:
            return {'error': 'Dispute not found'}
        
        if dispute.get('status') != DisputeStatus.OPEN:
            return {'error': 'Dispute already resolved'}

        submission_id = dispute.get('submissionId')
        timestamp = str(int(time.time()))

        # Determine new submission status
        if decision == 'APPROVE':
            new_status = SubmissionStatus.APPROVED
            payout_percent = 100
        elif decision == 'PARTIAL':
            new_status = SubmissionStatus.APPROVED  # Still approved but with reduced payout
            payout_percent = 50
        else:  # REJECT
            new_status = SubmissionStatus.REJECTED_FINAL
            payout_percent = 0

        # Update dispute
        disputes_table.update_item(
            Key={'disputeId': dispute_id},
            UpdateExpression='SET #status = :status, decision = :decision, adminNotes = :notes, resolvedAt = :ts, payoutPercent = :payout',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': DisputeStatus.RESOLVED,
                ':decision': decision,
                ':notes': admin_notes,
                ':ts': timestamp,
                ':payout': payout_percent
            }
        )

        # Update submission status (triggers payment if approved)
        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression='SET #status = :status, disputeResolution = :resolution, updatedAt = :ts',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': new_status,
                ':resolution': {
                    'decision': decision,
                    'payoutPercent': payout_percent,
                    'resolvedAt': timestamp
                },
                ':ts': timestamp
            }
        )

        print(f"Dispute {dispute_id} resolved with {decision}")

        return {
            'disputeId': dispute_id,
            'decision': decision,
            'payoutPercent': payout_percent,
            'submissionStatus': new_status,
            'resolved': True
        }

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e)}
