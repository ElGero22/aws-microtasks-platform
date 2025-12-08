"""
Auto-Resolve Disputes Handler.
Triggered by EventBridge scheduler to auto-approve disputes older than 3 days.
"""
import json
import boto3
import time
from datetime import datetime, timezone, timedelta
from shared.config import config
from shared.models import SubmissionStatus, DisputeStatus

# Auto-approve disputes older than this many days
AUTO_RESOLVE_DAYS = 3

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Scheduled handler to auto-approve old disputes.
    Should be triggered daily by EventBridge.
    """
    print(f"Running auto-resolve disputes check...")
    
    disputes_table = dynamodb.Table(config.DISPUTES_TABLE)
    submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
    
    # Calculate cutoff timestamp (3 days ago)
    cutoff = datetime.now(timezone.utc) - timedelta(days=AUTO_RESOLVE_DAYS)
    cutoff_ts = str(int(cutoff.timestamp()))
    
    # Scan for open disputes (in production, use GSI for efficiency)
    response = disputes_table.scan(
        FilterExpression='#status = :open AND createdAt < :cutoff',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':open': DisputeStatus.OPEN,
            ':cutoff': cutoff_ts
        }
    )
    
    old_disputes = response.get('Items', [])
    print(f"Found {len(old_disputes)} disputes older than {AUTO_RESOLVE_DAYS} days")
    
    resolved_count = 0
    timestamp = str(int(time.time()))
    
    for dispute in old_disputes:
        try:
            dispute_id = dispute['disputeId']
            submission_id = dispute['submissionId']
            
            # Auto-approve the dispute
            disputes_table.update_item(
                Key={'disputeId': dispute_id},
                UpdateExpression='SET #status = :status, decision = :decision, adminNotes = :notes, resolvedAt = :ts, payoutPercent = :payout',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': DisputeStatus.AUTO_APPROVED,
                    ':decision': 'AUTO_APPROVE',
                    ':notes': f'Auto-approved after {AUTO_RESOLVE_DAYS} days without admin review',
                    ':ts': timestamp,
                    ':payout': 100
                }
            )
            
            # Update submission to approved (triggers payment)
            submissions_table.update_item(
                Key={'submissionId': submission_id},
                UpdateExpression='SET #status = :status, disputeResolution = :resolution, updatedAt = :ts',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': SubmissionStatus.APPROVED,
                    ':resolution': {
                        'decision': 'AUTO_APPROVE',
                        'payoutPercent': 100,
                        'resolvedAt': timestamp,
                        'reason': 'Timeout - auto-approved'
                    },
                    ':ts': timestamp
                }
            )
            
            print(f"Auto-approved dispute {dispute_id}")
            resolved_count += 1
            
        except Exception as e:
            print(f"Error processing dispute {dispute.get('disputeId')}: {e}")
    
    return {
        'checked': len(old_disputes),
        'autoResolved': resolved_count
    }
