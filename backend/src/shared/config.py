"""
Configuration module for Lambda handlers.
Loads all environment variables needed by the platform.
"""
import os


class Config:
    """Centralized configuration from environment variables."""
    
    # AWS Region
    AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
    
    # DynamoDB Tables
    TASKS_TABLE = os.environ.get('TASKS_TABLE', '')
    SUBMISSIONS_TABLE = os.environ.get('SUBMISSIONS_TABLE', '')
    WALLETS_TABLE = os.environ.get('WALLETS_TABLE', '')
    TRANSACTIONS_TABLE = os.environ.get('TRANSACTIONS_TABLE', '')
    DISPUTES_TABLE = os.environ.get('DISPUTES_TABLE', '')
    ASSIGNMENTS_TABLE = os.environ.get('ASSIGNMENTS_TABLE', '')
    WORKERS_TABLE = os.environ.get('WORKERS_TABLE', '')
    
    # SQS Queues
    SUBMISSION_QUEUE_URL = os.environ.get('SUBMISSION_QUEUE_URL', '')
    AVAILABLE_TASKS_QUEUE_URL = os.environ.get('AVAILABLE_TASKS_QUEUE_URL', '')
    
    # Step Functions
    DISPUTE_STATE_MACHINE_ARN = os.environ.get('DISPUTE_STATE_MACHINE_ARN', '')
    
    # S3 Buckets
    MEDIA_BUCKET = os.environ.get('MEDIA_BUCKET', '')
    
    # AI Services Configuration
    SAGEMAKER_ENDPOINT_NAME = os.environ.get('SAGEMAKER_ENDPOINT_NAME', '')
    REKOGNITION_MIN_CONFIDENCE = float(os.environ.get('REKOGNITION_MIN_CONFIDENCE', '90'))
    TRANSCRIBE_LANGUAGE = os.environ.get('TRANSCRIBE_LANGUAGE', 'es-ES')
    TEXT_SIMILARITY_THRESHOLD = float(os.environ.get('TEXT_SIMILARITY_THRESHOLD', '0.85'))
    
    # Consensus (Majority Voting) Configuration
    CONSENSUS_QUORUM = int(os.environ.get('CONSENSUS_QUORUM', '3'))  # Submissions required for voting


config = Config()

