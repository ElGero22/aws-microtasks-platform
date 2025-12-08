"""
Fraud Detection Module.
Detects suspicious worker behavior such as bots and copy-paste responses.
"""
import boto3
import time
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from shared.config import config

# Fraud thresholds
BOT_DETECTION_MIN_SUBMISSIONS = 5  # Minimum submissions to analyze
BOT_TIMING_STD_THRESHOLD = 0.5     # If std dev of timing < 0.5s, likely bot
COPY_PASTE_SIMILARITY_THRESHOLD = 0.95  # 95% similarity = copy-paste
COPY_PASTE_TIME_WINDOW_SECONDS = 60     # Check last 60 seconds
SPAM_SUBMISSION_THRESHOLD = 3           # Max submissions per minute

dynamodb = boto3.resource('dynamodb', region_name=config.AWS_REGION)


class FraudDetector:
    """Detects fraudulent worker behavior."""
    
    @staticmethod
    def check_submission(worker_id: str, answer: str, task_type: str, task_id: str) -> dict:
        """
        Run all fraud checks on a submission.
        
        Args:
            worker_id: The worker's ID
            answer: The worker's submitted answer
            task_type: Type of task (image-classification, etc.)
            task_id: The task being submitted
            
        Returns:
            dict: {
                'is_fraud': bool,
                'fraud_score': float (0.0-1.0),
                'reasons': list of detected issues
            }
        """
        reasons = []
        scores = []
        
        # Check 1: Copy-paste detection
        copy_paste_result = FraudDetector.check_copy_paste(worker_id, answer, task_id)
        if copy_paste_result['detected']:
            reasons.append(f"Copy-paste detected: {copy_paste_result['similarity']:.0%} similar to recent submission")
            scores.append(1.0)
        
        # Check 2: Spam detection (too many submissions too fast)
        spam_result = FraudDetector.check_spam_submissions(worker_id)
        if spam_result['detected']:
            reasons.append(f"Spam detected: {spam_result['count']} submissions in last minute")
            scores.append(0.8)
        
        # Check 3: Bot pattern detection
        bot_result = FraudDetector.check_bot_pattern(worker_id)
        if bot_result['detected']:
            reasons.append(f"Bot pattern detected: timing std dev = {bot_result['timing_std']:.2f}s")
            scores.append(0.9)
        
        # Calculate overall fraud score
        fraud_score = max(scores) if scores else 0.0
        
        return {
            'is_fraud': fraud_score >= 0.8,
            'fraud_score': fraud_score,
            'reasons': reasons,
            'checks': {
                'copy_paste': copy_paste_result,
                'spam': spam_result,
                'bot': bot_result
            }
        }
    
    @staticmethod
    def check_copy_paste(worker_id: str, current_answer: str, current_task_id: str) -> dict:
        """
        Detect copy-paste responses by comparing to recent submissions.
        
        Returns:
            dict: {'detected': bool, 'similarity': float, 'matching_task': str or None}
        """
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
        
        # Get recent submissions from this worker in last 60 seconds
        cutoff = str(int(time.time()) - COPY_PASTE_TIME_WINDOW_SECONDS)
        
        try:
            # Query by worker using GSI
            response = submissions_table.query(
                IndexName='byWorker',
                KeyConditionExpression='workerId = :wid',
                FilterExpression='submittedAt > :cutoff',
                ExpressionAttributeValues={
                    ':wid': worker_id,
                    ':cutoff': cutoff
                },
                Limit=10
            )
            
            recent_submissions = response.get('Items', [])
            
            for sub in recent_submissions:
                if sub.get('taskId') == current_task_id:
                    continue  # Skip comparing to self
                
                previous_answer = sub.get('answer', '')
                if not previous_answer:
                    continue
                
                # Calculate similarity
                similarity = SequenceMatcher(None, current_answer, previous_answer).ratio()
                
                if similarity >= COPY_PASTE_SIMILARITY_THRESHOLD:
                    return {
                        'detected': True,
                        'similarity': similarity,
                        'matching_task': sub.get('taskId')
                    }
            
            return {'detected': False, 'similarity': 0.0, 'matching_task': None}
            
        except Exception as e:
            print(f"Error in copy-paste check: {e}")
            return {'detected': False, 'similarity': 0.0, 'matching_task': None, 'error': str(e)}
    
    @staticmethod
    def check_spam_submissions(worker_id: str) -> dict:
        """
        Detect spam by checking submission rate.
        
        Returns:
            dict: {'detected': bool, 'count': int}
        """
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
        
        # Check submissions in last minute
        cutoff = str(int(time.time()) - 60)
        
        try:
            response = submissions_table.query(
                IndexName='byWorker',
                KeyConditionExpression='workerId = :wid',
                FilterExpression='submittedAt > :cutoff',
                ExpressionAttributeValues={
                    ':wid': worker_id,
                    ':cutoff': cutoff
                },
                Select='COUNT'
            )
            
            count = response.get('Count', 0)
            
            return {
                'detected': count >= SPAM_SUBMISSION_THRESHOLD,
                'count': count
            }
            
        except Exception as e:
            print(f"Error in spam check: {e}")
            return {'detected': False, 'count': 0, 'error': str(e)}
    
    @staticmethod
    def check_bot_pattern(worker_id: str) -> dict:
        """
        Detect bot patterns by analyzing timing consistency.
        Bots tend to submit at very consistent intervals.
        
        Returns:
            dict: {'detected': bool, 'timing_std': float}
        """
        submissions_table = dynamodb.Table(config.SUBMISSIONS_TABLE)
        
        try:
            # Get recent submissions
            response = submissions_table.query(
                IndexName='byWorker',
                KeyConditionExpression='workerId = :wid',
                ExpressionAttributeValues={':wid': worker_id},
                ScanIndexForward=False,  # Most recent first
                Limit=BOT_DETECTION_MIN_SUBMISSIONS + 5
            )
            
            submissions = response.get('Items', [])
            
            if len(submissions) < BOT_DETECTION_MIN_SUBMISSIONS:
                return {'detected': False, 'timing_std': -1, 'reason': 'Not enough data'}
            
            # Extract timestamps and calculate intervals
            timestamps = []
            for sub in submissions:
                ts = sub.get('submittedAt')
                if ts:
                    timestamps.append(int(ts))
            
            if len(timestamps) < BOT_DETECTION_MIN_SUBMISSIONS:
                return {'detected': False, 'timing_std': -1}
            
            # Sort and calculate intervals
            timestamps.sort(reverse=True)
            intervals = []
            for i in range(len(timestamps) - 1):
                interval = timestamps[i] - timestamps[i + 1]
                if interval < 3600:  # Only consider intervals < 1 hour
                    intervals.append(interval)
            
            if len(intervals) < 3:
                return {'detected': False, 'timing_std': -1}
            
            # Calculate standard deviation
            mean = sum(intervals) / len(intervals)
            variance = sum((x - mean) ** 2 for x in intervals) / len(intervals)
            std_dev = variance ** 0.5
            
            # Very consistent timing = bot
            is_bot = std_dev < BOT_TIMING_STD_THRESHOLD and mean < 30  # < 30 sec avg between submissions
            
            return {
                'detected': is_bot,
                'timing_std': std_dev,
                'mean_interval': mean,
                'sample_size': len(intervals)
            }
            
        except Exception as e:
            print(f"Error in bot pattern check: {e}")
            return {'detected': False, 'timing_std': -1, 'error': str(e)}
    
    @staticmethod
    def should_flag(fraud_result: dict) -> bool:
        """Determine if a submission should be flagged/rejected."""
        return fraud_result.get('is_fraud', False)
    
    @staticmethod
    def get_rejection_reason(fraud_result: dict) -> str:
        """Get human-readable rejection reason."""
        reasons = fraud_result.get('reasons', [])
        if reasons:
            return f"Fraud detected: {'; '.join(reasons)}"
        return "Submission flagged for suspicious activity"
