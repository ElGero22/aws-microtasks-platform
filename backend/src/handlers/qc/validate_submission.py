"""
QC Validation Handler - AI-Powered Quality Control.
Triggered by SQS (Validation Queue).

Integrates with:
- Amazon Rekognition for image-classification tasks
- Amazon Transcribe for audio-transcription tasks
- Amazon SageMaker for custom ML models (optional)
"""
import json
import boto3
from decimal import Decimal
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
    worker_answer = body.get('answer')
    evaluate_submission(submission_id, task_id, worker_answer)


def process_stream_record(record):
    """Process a submission from DynamoDB Stream."""
    new_image = record['dynamodb']['NewImage']
    submission_id = new_image['submissionId']['S']
    task_id = new_image['taskId']['S']
    worker_answer = new_image['answer']['S']

    try:
        parsed_answer = json.loads(worker_answer)
        if isinstance(parsed_answer, str):
            worker_answer = parsed_answer
    except:
        pass

    evaluate_submission(submission_id, task_id, worker_answer)


def evaluate_submission(submission_id, task_id, worker_answer):
    """
    Evaluate a submission using AI services based on task type.
    
    Supports:
    - Gold standard validation (always takes precedence)
    - image-classification: Uses Amazon Rekognition
    - audio-transcription: Uses Amazon Transcribe comparison
    - Other types: Falls back to auto-approval or SageMaker
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
    
    print(f"Running AI QC for submission {submission_id}, task type: {task_type}")

    # Initialize QC results
    is_correct = False
    ai_confidence = 0.0
    reason = "Unknown"

    # =========================================================================
    # Gold Standard Check (always takes precedence)
    # =========================================================================
    if task.get('isGold'):
        gold_answer = task.get('goldAnswer')
        is_correct = str(worker_answer).strip().lower() == str(gold_answer).strip().lower()
        ai_confidence = 1.0 if is_correct else 0.0
        reason = "Gold Standard Validation"
        print(f"Gold check: expected='{gold_answer}', got='{worker_answer}', correct={is_correct}")

    # =========================================================================
    # Image Classification (Amazon Rekognition)
    # =========================================================================
    elif task_type == 'image-classification':
        image_key = payload.get('imageS3Key') or payload.get('image_key') or payload.get('imageKey')
        
        if image_key and config.MEDIA_BUCKET:
            try:
                print(f"Calling Rekognition for image: s3://{config.MEDIA_BUCKET}/{image_key}")
                labels = detect_labels(
                    bucket=config.MEDIA_BUCKET,
                    key=image_key,
                    min_confidence=config.REKOGNITION_MIN_CONFIDENCE
                )
                
                if labels:
                    is_correct, ai_confidence = compare_labels_with_answer(labels, worker_answer)
                    detected_labels = [l['Name'] for l in labels[:5]]
                    reason = f"Rekognition detected: {', '.join(detected_labels)}"
                    print(f"Rekognition result: match={is_correct}, confidence={ai_confidence:.2f}")
                else:
                    # No labels detected - flag for manual review
                    is_correct = False
                    ai_confidence = 0.0
                    reason = "Rekognition found no labels - needs manual review"
                    
            except Exception as e:
                print(f"Rekognition error: {e}")
                # Fallback to auto-approval on error
                is_correct = True
                ai_confidence = 0.5
                reason = f"Rekognition error, auto-approved: {str(e)[:100]}"
        else:
            print(f"Missing image_key or MEDIA_BUCKET for image-classification task")
            is_correct = True
            ai_confidence = 0.5
            reason = "Missing image configuration - auto-approved"

    # =========================================================================
    # Audio Transcription (Amazon Transcribe Comparison)
    # =========================================================================
    elif task_type == 'audio-transcription':
        ai_reference = task.get('aiTranscription', '')
        transcription_status = task.get('transcriptionStatus', '')
        job_name = task.get('transcriptionJobName', '')
        
        # If transcription is not ready yet, try to fetch it
        if not ai_reference and job_name and transcription_status != 'FAILED':
            print(f"Fetching transcription result for job: {job_name}")
            try:
                ai_reference = get_transcription_result(job_name)
                if ai_reference:
                    # Update task with transcription result for future use
                    tasks_table.update_item(
                        Key={'taskId': task_id},
                        UpdateExpression='SET aiTranscription = :t, transcriptionStatus = :s',
                        ExpressionAttributeValues={
                            ':t': ai_reference,
                            ':s': 'COMPLETED'
                        }
                    )
            except Exception as e:
                print(f"Error fetching transcription: {e}")
        
        if ai_reference:
            # Compare using text similarity
            normalized_worker = normalize_text(str(worker_answer))
            normalized_ai = normalize_text(ai_reference)
            
            similarity = text_similarity(normalized_worker, normalized_ai)
            ai_confidence = similarity
            is_correct = similarity >= config.TEXT_SIMILARITY_THRESHOLD
            
            reason = f"Text similarity: {similarity:.1%}"
            print(f"Transcribe comparison: similarity={similarity:.2f}, threshold={config.TEXT_SIMILARITY_THRESHOLD}")
        else:
            # No AI reference available
            print("No AI transcription reference available for comparison")
            is_correct = True
            ai_confidence = 0.5
            reason = "No AI transcription available - auto-approved"

    # =========================================================================
    # SageMaker Custom Model (Optional)
    # =========================================================================
    elif config.SAGEMAKER_ENDPOINT_NAME:
        try:
            print(f"Invoking SageMaker endpoint: {config.SAGEMAKER_ENDPOINT_NAME}")
            prediction = invoke_sagemaker_endpoint({
                'task_type': task_type,
                'task_payload': payload,
                'worker_answer': worker_answer,
                'submission_id': submission_id
            })
            
            if prediction:
                is_correct = prediction.get('approved', True)
                ai_confidence = prediction.get('confidence', 0.5)
                reason = f"SageMaker prediction: {prediction.get('reason', 'Model decision')}"
            else:
                is_correct = True
                ai_confidence = 0.5
                reason = "SageMaker returned no prediction - auto-approved"
                
        except Exception as e:
            print(f"SageMaker error: {e}")
            is_correct = True
            ai_confidence = 0.5
            reason = f"SageMaker error - auto-approved: {str(e)[:50]}"

    # =========================================================================
    # Fallback: Auto-approve for unknown task types
    # =========================================================================
    else:
        print(f"Unknown task type '{task_type}' - auto-approving")
        is_correct = True
        ai_confidence = 0.5
        reason = f"Auto-approved (task type: {task_type})"

    # =========================================================================
    # Determine final status
    # =========================================================================
    new_status = SubmissionStatus.APPROVED if is_correct else SubmissionStatus.REJECTED

    # =========================================================================
    # Send EventBridge Event
    # =========================================================================
    try:
        events.put_events(
            Entries=[{
                'Source': 'crowdsourcing.qc',
                'DetailType': 'SubmissionQCCompleted',
                'Detail': json.dumps({
                    'submissionId': submission_id,
                    'taskId': task_id,
                    'status': new_status,
                    'aiConfidence': float(ai_confidence),
                    'reason': reason,
                    'taskType': task_type
                })
            }]
        )
        print("Sent QC event to EventBridge")
    except Exception as e:
        print(f"Failed to send EventBridge event: {e}")

    # =========================================================================
    # Update Submission in DynamoDB
    # =========================================================================
    try:
        submissions_table.update_item(
            Key={'submissionId': submission_id},
            UpdateExpression="SET #status = :s, qcReason = :r, aiConfidence = :c",
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':s': new_status,
                ':r': reason,
                ':c': Decimal(str(round(ai_confidence, 4)))
            }
        )
        print(f"Submission {submission_id} marked as {new_status} with confidence {ai_confidence:.2f}")
    except Exception as e:
        print(f"Error updating submission: {e}")
        raise

