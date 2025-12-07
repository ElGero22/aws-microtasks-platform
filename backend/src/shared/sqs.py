"""
SQS utility functions for message operations.
"""
import boto3
import json
from typing import List, Dict, Any
from .config import config
from .logging import logger

sqs = boto3.client('sqs', region_name=config.AWS_REGION)


def send_message(queue_url: str, message_body: Dict[str, Any]) -> bool:
    """
    Send a single message to SQS queue.
    
    Args:
        queue_url: SQS queue URL
        message_body: Message body as dict (will be JSON serialized)
        
    Returns:
        True if sent successfully, False otherwise
    """
    try:
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message_body, default=str)
        )
        logger.info(f"Message sent to {queue_url}")
        return True
    except Exception as e:
        logger.error(f"Error sending message to SQS: {e}")
        return False


def send_message_batch(queue_url: str, messages: List[Dict[str, Any]]) -> bool:
    """
    Send multiple messages to SQS queue (max 10 per batch).
    
    Args:
        queue_url: SQS queue URL
        messages: List of message bodies
        
    Returns:
        True if all sent successfully, False otherwise
    """
    try:
        # SQS batch limit is 10 messages
        for i in range(0, len(messages), 10):
            batch = messages[i:i+10]
            entries = [
                {
                    'Id': str(idx),
                    'MessageBody': json.dumps(msg, default=str)
                }
                for idx, msg in enumerate(batch)
            ]
            
            response = sqs.send_message_batch(
                QueueUrl=queue_url,
                Entries=entries
            )
            
            if response.get('Failed'):
                logger.warning(f"Some messages failed: {response['Failed']}")
                return False
                
        logger.info(f"Sent {len(messages)} messages to {queue_url}")
        return True
        
    except Exception as e:
        logger.error(f"Error sending batch to SQS: {e}")
        return False
