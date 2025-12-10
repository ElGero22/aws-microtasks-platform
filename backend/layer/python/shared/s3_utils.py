"""
S3 utility functions for media operations.
Generates presigned URLs for private bucket access.
"""
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from .config import config
from .logging import logger

# S3 client with custom signature version for presigned URLs
s3_client = boto3.client(
    's3',
    region_name=config.AWS_REGION,
    config=BotoConfig(signature_version='s3v4')
)


def generate_presigned_url(
    s3_key: str,
    expiration: int = 3600,
    bucket_name: str = None
) -> str:
    """
    Generate a presigned URL for S3 object download.
    
    Args:
        s3_key: The S3 object key (e.g., 'media/uuid.jpg')
        expiration: URL expiration time in seconds (default 1 hour)
        bucket_name: Optional bucket name, defaults to config.MEDIA_BUCKET
        
    Returns:
        Presigned URL string or original key if generation fails
    """
    if not s3_key:
        return s3_key
    
    bucket = bucket_name or config.MEDIA_BUCKET
    if not bucket:
        logger.warning("No MEDIA_BUCKET configured, returning original key")
        return s3_key
    
    # If it's already a full URL (http/https), extract the key or return as-is
    if s3_key.startswith('http://') or s3_key.startswith('https://'):
        # Check if it's our bucket URL and extract key
        bucket_url = f"https://{bucket}.s3.amazonaws.com/"
        if s3_key.startswith(bucket_url):
            s3_key = s3_key[len(bucket_url):]
        else:
            # It's an external URL, return as-is
            return s3_key
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket,
                'Key': s3_key
            },
            ExpiresIn=expiration
        )
        logger.info(f"Generated presigned URL for {s3_key}")
        return url
        
    except ClientError as e:
        logger.error(f"Error generating presigned URL for {s3_key}: {e}")
        return s3_key
    except Exception as e:
        logger.error(f"Unexpected error generating presigned URL: {e}")
        return s3_key


def is_media_key(url_or_key: str) -> bool:
    """
    Check if a URL or key points to media in our S3 bucket.
    
    Args:
        url_or_key: URL or S3 key to check
        
    Returns:
        True if it's a media key that should be signed
    """
    if not url_or_key:
        return False
    
    # Check if it's a media/ prefix key
    if url_or_key.startswith('media/'):
        return True
    
    # Check if it's our bucket URL
    bucket = config.MEDIA_BUCKET
    if bucket and url_or_key.startswith(f"https://{bucket}.s3"):
        return True
    
    return False
