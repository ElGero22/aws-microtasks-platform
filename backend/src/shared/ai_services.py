"""
AWS AI Services module for QC validation.
Provides integrations with Amazon Rekognition, Amazon Transcribe, and Amazon SageMaker.
"""
import json
import boto3
import urllib.request
from typing import List, Dict, Any, Optional, Tuple
from shared.config import config


# Initialize AWS clients lazily
_rekognition_client = None
_transcribe_client = None
_sagemaker_client = None
_s3_client = None


def get_rekognition_client():
    """Get or create Rekognition client."""
    global _rekognition_client
    if _rekognition_client is None:
        _rekognition_client = boto3.client('rekognition', region_name=config.AWS_REGION)
    return _rekognition_client


def get_transcribe_client():
    """Get or create Transcribe client."""
    global _transcribe_client
    if _transcribe_client is None:
        _transcribe_client = boto3.client('transcribe', region_name=config.AWS_REGION)
    return _transcribe_client


def get_sagemaker_client():
    """Get or create SageMaker Runtime client."""
    global _sagemaker_client
    if _sagemaker_client is None:
        _sagemaker_client = boto3.client('sagemaker-runtime', region_name=config.AWS_REGION)
    return _sagemaker_client


def get_s3_client():
    """Get or create S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client('s3', region_name=config.AWS_REGION)
    return _s3_client


# =============================================================================
# Amazon Rekognition Functions
# =============================================================================

def detect_labels(
    bucket: str,
    key: str,
    min_confidence: float = None,
    max_labels: int = 20
) -> List[Dict[str, Any]]:
    """
    Detect labels in an image using Amazon Rekognition.
    
    Args:
        bucket: S3 bucket name containing the image
        key: S3 object key of the image
        min_confidence: Minimum confidence threshold (0-100), defaults to config value
        max_labels: Maximum number of labels to return
        
    Returns:
        List of label dictionaries with 'Name' and 'Confidence' keys
    """
    if min_confidence is None:
        min_confidence = config.REKOGNITION_MIN_CONFIDENCE
    
    client = get_rekognition_client()
    
    try:
        response = client.detect_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            MaxLabels=max_labels,
            MinConfidence=min_confidence
        )
        
        labels = response.get('Labels', [])
        print(f"Rekognition detected {len(labels)} labels for s3://{bucket}/{key}")
        
        return [
            {
                'Name': label['Name'],
                'Confidence': label['Confidence'],
                'Parents': [p['Name'] for p in label.get('Parents', [])]
            }
            for label in labels
        ]
        
    except Exception as e:
        print(f"Error calling Rekognition: {e}")
        return []


def compare_labels_with_answer(
    labels: List[Dict[str, Any]],
    worker_answer: str
) -> Tuple[bool, float]:
    """
    Compare Rekognition labels with worker's answer using flexible matching.
    
    Matching strategy:
    - Case-insensitive comparison
    - Checks if answer is contained in any label OR vice versa
    - Also checks parent labels for hierarchical matching
    
    Args:
        labels: List of label dictionaries from detect_labels()
        worker_answer: Worker's submitted answer
        
    Returns:
        Tuple of (is_match: bool, confidence: float 0.0-1.0)
    """
    if not labels or not worker_answer:
        return False, 0.0
    
    worker_answer_lower = str(worker_answer).lower().strip()
    
    # Build list of all label names including parents
    all_label_names = []
    for label in labels:
        all_label_names.append((label['Name'].lower(), label['Confidence']))
        for parent in label.get('Parents', []):
            # Use parent confidence as same as child label
            all_label_names.append((parent.lower(), label['Confidence']))
    
    # Find matches using flexible comparison
    matching_confidences = []
    for label_name, confidence in all_label_names:
        # Exact match
        if worker_answer_lower == label_name:
            matching_confidences.append(confidence)
        # Worker answer contained in label (e.g., "car" in "sports car")
        elif worker_answer_lower in label_name:
            matching_confidences.append(confidence)
        # Label contained in worker answer (e.g., "car" contains "car")
        elif label_name in worker_answer_lower:
            matching_confidences.append(confidence)
    
    if matching_confidences:
        max_confidence = max(matching_confidences) / 100.0  # Convert to 0-1 scale
        return True, max_confidence
    
    return False, 0.0


# =============================================================================
# Amazon Transcribe Functions
# =============================================================================

def start_transcription_job(
    bucket: str,
    key: str,
    job_name: str = None,
    language: str = None
) -> str:
    """
    Start an asynchronous transcription job for an audio file.
    
    Args:
        bucket: S3 bucket containing the audio file
        key: S3 object key of the audio file
        job_name: Optional job name (will be auto-generated if not provided)
        language: Language code (e.g., 'es-ES', 'en-US'), defaults to config value
        
    Returns:
        Transcription job name
    """
    if language is None:
        language = config.TRANSCRIBE_LANGUAGE
    
    if job_name is None:
        import uuid
        # Job name must be unique and follow naming rules
        job_name = f"task-transcription-{uuid.uuid4().hex[:12]}"
    
    client = get_transcribe_client()
    
    # Determine media format from file extension
    extension = key.rsplit('.', 1)[-1].lower() if '.' in key else 'mp3'
    media_format_map = {
        'mp3': 'mp3',
        'mp4': 'mp4',
        'wav': 'wav',
        'flac': 'flac',
        'ogg': 'ogg',
        'webm': 'webm',
        'm4a': 'mp4'
    }
    media_format = media_format_map.get(extension, 'mp3')
    
    try:
        response = client.start_transcription_job(
            TranscriptionJobName=job_name,
            LanguageCode=language,
            MediaFormat=media_format,
            Media={
                'MediaFileUri': f's3://{bucket}/{key}'
            },
            OutputBucketName=bucket,  # Store results in same bucket
            OutputKey=f'transcriptions/{job_name}.json'
        )
        
        print(f"Started transcription job: {job_name} for s3://{bucket}/{key}")
        return job_name
        
    except Exception as e:
        print(f"Error starting transcription job: {e}")
        raise


def get_transcription_job_status(job_name: str) -> Dict[str, Any]:
    """
    Get the status of a transcription job.
    
    Args:
        job_name: Transcription job name
        
    Returns:
        Dictionary with 'status' and optionally 'transcript_uri'
    """
    client = get_transcribe_client()
    
    try:
        response = client.get_transcription_job(
            TranscriptionJobName=job_name
        )
        
        job = response.get('TranscriptionJob', {})
        status = job.get('TranscriptionJobStatus', 'UNKNOWN')
        
        result = {'status': status, 'job_name': job_name}
        
        if status == 'COMPLETED':
            result['transcript_uri'] = job.get('Transcript', {}).get('TranscriptFileUri', '')
        elif status == 'FAILED':
            result['failure_reason'] = job.get('FailureReason', 'Unknown error')
            
        return result
        
    except Exception as e:
        print(f"Error getting transcription job status: {e}")
        return {'status': 'ERROR', 'error': str(e)}


def get_transcription_result(job_name: str) -> str:
    """
    Get the transcription text result from a completed job.
    
    Args:
        job_name: Transcription job name
        
    Returns:
        Transcribed text or empty string if not available
    """
    status_info = get_transcription_job_status(job_name)
    
    if status_info.get('status') != 'COMPLETED':
        print(f"Transcription job {job_name} is not completed: {status_info.get('status')}")
        return ''
    
    transcript_uri = status_info.get('transcript_uri', '')
    if not transcript_uri:
        return ''
    
    try:
        # Fetch the transcript JSON from the URI
        with urllib.request.urlopen(transcript_uri) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        # Extract the transcript text
        transcripts = data.get('results', {}).get('transcripts', [])
        if transcripts:
            return transcripts[0].get('transcript', '')
        
        return ''
        
    except Exception as e:
        print(f"Error fetching transcription result: {e}")
        return ''


# =============================================================================
# Amazon SageMaker Functions (Optional)
# =============================================================================

def invoke_sagemaker_endpoint(
    payload: Dict[str, Any],
    endpoint_name: str = None
) -> Optional[Dict[str, Any]]:
    """
    Invoke a SageMaker endpoint for AI inference.
    
    Args:
        payload: Input data for the model
        endpoint_name: SageMaker endpoint name, defaults to config value
        
    Returns:
        Model prediction response or None if endpoint not configured
    """
    if endpoint_name is None:
        endpoint_name = config.SAGEMAKER_ENDPOINT_NAME
    
    if not endpoint_name:
        print("No SageMaker endpoint configured")
        return None
    
    client = get_sagemaker_client()
    
    try:
        response = client.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType='application/json',
            Accept='application/json',
            Body=json.dumps(payload)
        )
        
        result = json.loads(response['Body'].read().decode('utf-8'))
        print(f"SageMaker endpoint {endpoint_name} returned: {result}")
        return result
        
    except Exception as e:
        print(f"Error invoking SageMaker endpoint: {e}")
        return None
