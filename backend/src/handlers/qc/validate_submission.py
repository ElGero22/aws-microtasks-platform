"""
QC Validation Handler - AI-Powered Quality Control with Majority Voting.
Triggered by SQS (Validation Queue).

Integrates with:
- Amazon Rekognition for image-classification tasks
- Amazon Transcribe for audio-transcription tasks
- Amazon SageMaker for custom ML models (optional)
- Consensus/Majority Voting for group validation
"""
import json
import boto3
from collections import Counter
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from shared.config import config
from shared.models import SubmissionStatus, TaskStatus
from shared.utils import text_similarity, normalize_text
from shared.ai_services import (
    detect_labels,
    compare_labels_with_answer,
    get_transcription_result,
    invoke_sagemaker_endpoint
)

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
                    import traceback
                    traceback.print_exc()
            elif 'dynamodb' in record:
                if record['eventName'] == 'INSERT':
                    process_stream_record(record)
        return {"message": "Processed records"}

    return {"message": "Direct invocation ignored"}


def process_sqs_message(record):
    """Process a submission from SQS queue."""
    body = json.loads(record['body'])
    submission_id = body.get('submissionId')
    task_id = body.get('taskId')
    worker_id = body.get('workerId', 'unknown')
    worker_answer = body.get('answer')
    evaluate_submission(submission_id, task_id, worker_id, worker_answer)


def process_stream_record(record):
    """Process a submission from DynamoDB Stream."""
    new_image = record['dynamodb']['NewImage']
    submission_id = new_image['submissionId']['S']
    task_id = new_image['taskId']['S']
    worker_id = new_image.get('workerId', {}).get('S', 'unknown')
    worker_answer = new_image['answer']['S']

    try:
        parsed_answer = json.loads(worker_answer)
        if isinstance(parsed_answer, str):
            worker_answer = parsed_answer
    except:
        pass

    evaluate_submission(submission_id, task_id, worker_id, worker_answer)


# =============================================================================
# CONSENSUS (MAJORITY VOTING) FUNCTIONS
# =============================================================================

def get_submissions_for_task(task_id):
    """
    Query all submissions for a task using byTask GSI.
    Returns list of submission items.
    """
    submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
    response = submissions_table.query(
        IndexName='byTask',
        KeyConditionExpression=Key('taskId').eq(task_id)
    )
    return response.get('Items', [])


def calculate_consensus(submissions, quorum):
    """
    Calculate consensus from submission answers using majority voting.
    
    Args:
        submissions: List of submission items with 'answer' field
        quorum: Number of submissions required for quorum
    
    Returns:
        tuple: (consensus_answer, matching_submissions, non_matching_submissions)
               consensus_answer is None if no majority exists
    """
    # Normalize answers for comparison
    answer_map = {}  # normalized_answer -> [submissions]
    for sub in submissions:
        answer = str(sub.get('answer', '')).strip().lower()
        if answer not in answer_map:
            answer_map[answer] = []
        answer_map[answer].append(sub)
    
    # Find mode (most common answer)
    if not answer_map:
        return None, [], submissions
    
    # Get answer with highest count
    sorted_answers = sorted(answer_map.items(), key=lambda x: len(x[1]), reverse=True)
    consensus_answer, matching_subs = sorted_answers[0]
    consensus_count = len(matching_subs)
    
    # Check if consensus exists (simple majority: more than half)
    majority_threshold = (quorum // 2) + 1
    if consensus_count >= majority_threshold:
        non_matching = [s for s in submissions if s not in matching_subs]
        print(f"Consensus found: '{consensus_answer}' with {consensus_count}/{quorum} votes")
        return consensus_answer, matching_subs, non_matching
    
    # No clear consensus - all get rejected
    print(f"No consensus: highest count {consensus_count} < majority {majority_threshold}")
    return None, [], submissions


def update_submission_status(submission_id, status, reason, ai_confidence=0.0):
    """Update a single submission's status."""
    submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
    try:
        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression="SET #status = :s, qcReason = :r, aiConfidence = :c",
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':s': status,
                ':r': reason,
                ':c': Decimal(str(round(ai_confidence, 4)))
            }
        )
        print(f"Submission {submission_id} marked as {status}")
    except Exception as e:
        print(f"Error updating submission {submission_id}: {e}")
        raise


def process_consensus_batch(matching, non_matching, task_id):
    """
    Process all submissions in a batch once consensus is determined.
    Approves matching, rejects non-matching, and emits events.
    """
    # Approve matching submissions
    for sub in matching:
        sub_id = sub['submissionId']
        update_submission_status(
            sub_id,
            SubmissionStatus.APPROVED,
            'Majority Consensus: Answer matched group consensus',
            ai_confidence=1.0
        )
        emit_qc_event(sub_id, task_id, SubmissionStatus.APPROVED, 1.0, 'Majority Consensus')
    
    # Reject non-matching submissions
    for sub in non_matching:
        sub_id = sub['submissionId']
        update_submission_status(
            sub_id,
            SubmissionStatus.REJECTED,
            'Consensus Mismatch: Answer did not match group consensus',
            ai_confidence=0.0
        )
        emit_qc_event(sub_id, task_id, SubmissionStatus.REJECTED, 0.0, 'Consensus Mismatch')


def emit_qc_event(submission_id, task_id, status, confidence, reason):
    """Send QC completion event to EventBridge."""
    try:
        events.put_events(
            Entries=[{
                'Source': 'crowdsourcing.qc',
                'DetailType': 'SubmissionQCCompleted',
                'Detail': json.dumps({
                    'submissionId': submission_id,
                    'taskId': task_id,
                    'status': status,
                    'aiConfidence': float(confidence),
                    'reason': reason
                })
            }]
        )
    except Exception as e:
        print(f"Failed to send EventBridge event for {submission_id}: {e}")


# =============================================================================
# MAIN EVALUATION LOGIC
# =============================================================================

def evaluate_submission(submission_id, task_id, worker_id, worker_answer):
    """
    Evaluate a submission using AI services and/or consensus voting.
    
    Flow:
    1. Gold standard tasks: Process individually (bypass consensus)
    2. Regular tasks: Wait for quorum, then apply majority voting
    """
    tasks_table = dynamodb.Table(config.TASKS_TABLE)
    submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)

    task_resp = tasks_table.get_item(Key={'taskId': task_id})
    task = task_resp.get('Item')

    if not task:
        print(f"Task {task_id} not found")
        return

    task_type = task.get('type', 'generic')
    payload = task.get('payload', {})
    
    print(f"Running QC for submission {submission_id}, task type: {task_type}")

    # =========================================================================
    # Gold Standard Check (always processed individually, bypasses consensus)
    # =========================================================================
    if task.get('isGold'):
        gold_answer = task.get('goldAnswer')
        is_correct = str(worker_answer).strip().lower() == str(gold_answer).strip().lower()
        ai_confidence = 1.0 if is_correct else 0.0
        reason = "Gold Standard Validation"
        new_status = SubmissionStatus.APPROVED if is_correct else SubmissionStatus.REJECTED
        
        print(f"Gold check: expected='{gold_answer}', got='{worker_answer}', correct={is_correct}")
        
        update_submission_status(submission_id, new_status, reason, ai_confidence)
        emit_qc_event(submission_id, task_id, new_status, ai_confidence, reason)
        return

    # =========================================================================
    # CONSENSUS (MAJORITY VOTING) FLOW
    # =========================================================================
    
    # Step 1: Mark current submission as PendingConsensus
    # This ensures the answer is saved even if GSI has lag
    try:
        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression="SET #status = :s",
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':s': SubmissionStatus.PENDING_CONSENSUS
            }
        )
        print(f"Submission {submission_id} marked as PENDING_CONSENSUS")
    except Exception as e:
        print(f"Error marking submission as pending: {e}")
    
    # Step 2: Query all submissions for this task
    existing_submissions = get_submissions_for_task(task_id)
    
    # Step 3: Handle GSI eventual consistency
    # If current submission not in list (GSI lag), add it manually
    current_sub_in_list = any(s.get('submissionId') == submission_id for s in existing_submissions)
    if not current_sub_in_list:
        print(f"GSI lag detected: adding current submission to list manually")
        existing_submissions.append({
            'submissionId': submission_id,
            'taskId': task_id,
            'workerId': worker_id,
            'answer': worker_answer,
            'status': SubmissionStatus.PENDING_CONSENSUS
        })
    
    # Step 4: Check quorum
    quorum = config.CONSENSUS_QUORUM
    submission_count = len(existing_submissions)
    
    print(f"Quorum check: {submission_count}/{quorum} submissions")
    
    if submission_count < quorum:
        print(f"Quorum not reached. Waiting for more submissions.")
        # Already marked as PENDING_CONSENSUS, just exit
        return
    
    # Step 5: Quorum reached! Calculate consensus
    print(f"Quorum reached! Calculating consensus for {submission_count} submissions...")
    
    consensus_answer, matching, non_matching = calculate_consensus(existing_submissions, quorum)
    
    # Step 6: Process all submissions based on consensus
    if consensus_answer is not None:
        # Consensus found - approve matching, reject non-matching
        print(f"Processing batch: {len(matching)} approved, {len(non_matching)} rejected")
        process_consensus_batch(matching, non_matching, task_id)
    else:
        # No consensus - all get rejected
        print(f"No consensus found - rejecting all {len(existing_submissions)} submissions")
        for sub in existing_submissions:
            sub_id = sub['submissionId']
            update_submission_status(
                sub_id,
                SubmissionStatus.REJECTED,
                'No Consensus: No majority agreement among submissions',
                ai_confidence=0.0
            )
            emit_qc_event(sub_id, task_id, SubmissionStatus.REJECTED, 0.0, 'No Consensus')
    
    print(f"Consensus processing complete for task {task_id}")
