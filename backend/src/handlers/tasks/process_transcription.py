"""
Process Transcription Lambda Handler.
Triggered by EventBridge when Amazon Transcribe completes a job.
Updates the corresponding task with the transcription result.
"""
import json
import boto3
from shared.config import config
from shared.ai_services import get_transcription_result


dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


def handler(event, context):
    """
    Handler for processing completed Amazon Transcribe jobs.
    
    Triggered by EventBridge rule matching:
    - source: aws.transcribe
    - detail-type: Transcribe Job State Change
    - detail.TranscriptionJobStatus: COMPLETED or FAILED
    """
    print("Received Transcribe event:", json.dumps(event))
    
    # Extract job details from EventBridge event
    detail = event.get('detail', {})
    job_name = detail.get('TranscriptionJobName', '')
    status = detail.get('TranscriptionJobStatus', '')
    
    if not job_name:
        print("No TranscriptionJobName in event")
        return {"message": "No job name provided"}
    
    print(f"Processing transcription job: {job_name}, status: {status}")
    
    # Find task with this transcription job name
    tasks_table = dynamodb.Table(config.TASKS_TABLE)
    
    # Query by transcriptionJobName using a scan (or GSI if available)
    # Note: In production, consider adding a GSI on transcriptionJobName
    try:
        response = tasks_table.scan(
            FilterExpression='transcriptionJobName = :jn',
            ExpressionAttributeValues={':jn': job_name},
            Limit=1
        )
        
        items = response.get('Items', [])
        if not items:
            print(f"No task found with transcriptionJobName: {job_name}")
            return {"message": "Task not found"}
        
        task = items[0]
        task_id = task['taskId']
        
    except Exception as e:
        print(f"Error finding task: {e}")
        return {"message": f"Error: {str(e)}"}
    
    # Process based on status
    if status == 'COMPLETED':
        try:
            # Fetch the transcription text
            transcription_text = get_transcription_result(job_name)
            
            if transcription_text:
                # Update task with transcription result
                tasks_table.update_item(
                    Key={'taskId': task_id},
                    UpdateExpression='SET aiTranscription = :t, transcriptionStatus = :s',
                    ExpressionAttributeValues={
                        ':t': transcription_text,
                        ':s': 'COMPLETED'
                    }
                )
                print(f"Updated task {task_id} with transcription ({len(transcription_text)} chars)")
                return {
                    "message": "Transcription saved",
                    "taskId": task_id,
                    "transcriptionLength": len(transcription_text)
                }
            else:
                # Transcription empty
                tasks_table.update_item(
                    Key={'taskId': task_id},
                    UpdateExpression='SET transcriptionStatus = :s, transcriptionError = :e',
                    ExpressionAttributeValues={
                        ':s': 'FAILED',
                        ':e': 'Empty transcription result'
                    }
                )
                print(f"Task {task_id}: Empty transcription result")
                return {"message": "Empty transcription", "taskId": task_id}
                
        except Exception as e:
            print(f"Error fetching transcription result: {e}")
            tasks_table.update_item(
                Key={'taskId': task_id},
                UpdateExpression='SET transcriptionStatus = :s, transcriptionError = :e',
                ExpressionAttributeValues={
                    ':s': 'FAILED',
                    ':e': str(e)[:200]
                }
            )
            return {"message": f"Error: {str(e)}", "taskId": task_id}
            
    elif status == 'FAILED':
        failure_reason = detail.get('FailureReason', 'Unknown error')
        
        # Update task with failure status
        tasks_table.update_item(
            Key={'taskId': task_id},
            UpdateExpression='SET transcriptionStatus = :s, transcriptionError = :e',
            ExpressionAttributeValues={
                ':s': 'FAILED',
                ':e': failure_reason[:200]
            }
        )
        print(f"Task {task_id}: Transcription failed - {failure_reason}")
        return {
            "message": "Transcription failed",
            "taskId": task_id,
            "reason": failure_reason
        }
    
    return {"message": f"Unhandled status: {status}"}
