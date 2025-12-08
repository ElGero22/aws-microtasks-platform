"""
Create Task Batch Handler.
Creates multiple tasks in a batch, with optional Gold Standard tasks.
For audio-transcription tasks, automatically starts Amazon Transcribe jobs.
"""
import json
import uuid
import datetime
from shared.config import config
from shared.logging import logger, log_event
from shared.auth import get_user_sub
from shared.models import TaskStatus
from shared.dynamo import batch_write_items


def handler(event, context):
    log_event(event)

    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid JSON'})
        }

    requester_id = get_user_sub(event)
    if not requester_id:
        requester_id = body.get('requesterId', 'demo-requester')

    tasks_data = body.get('tasks', [])
    if not tasks_data:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'No tasks provided'})
        }

    batch_id = str(uuid.uuid4())
    # Use timezone-aware datetime
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    items_to_write = []
    transcription_started = 0

    for task_input in tasks_data:
        task_id = str(uuid.uuid4())
        task_type = task_input.get('type', 'generic')
        payload = task_input.get('payload', {})
        
        # Logic: if goldAnswer is present and truthy, it is gold. Or if isGold is explicitly true.
        is_gold = task_input.get('isGold', False)
        gold_answer = task_input.get('goldAnswer')

        if gold_answer:
            is_gold = True

        item = {
            'taskId': task_id,
            'requesterId': requester_id,
            'batchId': batch_id,
            'status': TaskStatus.CREATED,
            'type': task_type,
            'payload': payload,
            'createdAt': timestamp,
            'isGold': is_gold,
            'requiredLevel': task_input.get('requiredLevel', 'Novice')  # Gamification: skill level required
        }

        # Only add goldAnswer if it exists (not None)
        if is_gold and gold_answer is not None:
            item['goldAnswer'] = gold_answer

        # =================================================================
        # Audio Transcription: Start Amazon Transcribe job pre-emptively
        # =================================================================
        if task_type == 'audio-transcription' and not is_gold:
            audio_key = payload.get('audioS3Key') or payload.get('audio_key') or payload.get('audioKey')
            
            if audio_key and config.MEDIA_BUCKET:
                try:
                    from shared.ai_services import start_transcription_job
                    
                    job_name = start_transcription_job(
                        bucket=config.MEDIA_BUCKET,
                        key=audio_key,
                        language=config.TRANSCRIBE_LANGUAGE
                    )
                    
                    item['transcriptionJobName'] = job_name
                    item['transcriptionStatus'] = 'IN_PROGRESS'
                    transcription_started += 1
                    print(f"Started transcription job {job_name} for task {task_id}")
                    
                except Exception as e:
                    print(f"Failed to start transcription for task {task_id}: {e}")
                    # Continue without transcription - will be handled at QC time
                    item['transcriptionStatus'] = 'NOT_STARTED'
            else:
                print(f"Missing audio_key or MEDIA_BUCKET for audio-transcription task {task_id}")

        items_to_write.append(item)

    success = batch_write_items(config.TASKS_TABLE, items_to_write)

    if not success:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Failed to save tasks'})
        }

    response_body = {
        'message': f'Created {len(items_to_write)} tasks',
        'batchId': batch_id,
        'requesterId': requester_id
    }
    
    if transcription_started > 0:
        response_body['transcriptionJobsStarted'] = transcription_started

    return {
        'statusCode': 201,
        'body': json.dumps(response_body)
    }

