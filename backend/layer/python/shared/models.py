"""
Data models and status constants for the microtasks platform.
Based on the task lifecycle: Created → Published → Assigned → Submitted → Review → Approved/Rejected → Paid
"""


class TaskStatus:
    """Task lifecycle statuses."""
    CREATED = 'Created'
    SCHEDULED = 'Scheduled'  # Waiting for publishAt time
    PUBLISHED = 'Published'
    ASSIGNED = 'Assigned'
    SUBMITTED = 'Submitted'
    REVIEW = 'Review'
    COMPLETED = 'Completed'
    EXPIRED = 'Expired'


class SubmissionStatus:
    """Submission review statuses."""
    PENDING = 'Pending'
    PENDING_CONSENSUS = 'PendingConsensus'  # Awaiting quorum for majority voting
    APPROVED = 'Approved'
    REJECTED = 'Rejected'
    DISPUTED = 'Disputed'
    REJECTED_FINAL = 'RejectedFinal'


class AssignmentStatus:
    """Assignment statuses."""
    ASSIGNED = 'Assigned'
    SUBMITTED = 'Submitted'
    EXPIRED = 'Expired'


class DisputeStatus:
    """Dispute resolution statuses."""
    OPEN = 'Open'
    RESOLVED = 'Resolved'
    AUTO_APPROVED = 'AutoApproved'


class WorkerLevel:
    """Worker skill levels."""
    NOVICE = 'Novice'
    INTERMEDIATE = 'Intermediate'
    EXPERT = 'Expert'


class TransactionType:
    """Transaction types for wallet operations."""
    DEPOSIT = 'DEPOSIT'
    WITHDRAWAL = 'WITHDRAWAL'
    TASK_PAYMENT = 'TASK_PAYMENT'
    PLATFORM_FEE = 'PLATFORM_FEE'
    REFUND = 'REFUND'


class Certification:
    """Worker certifications for skill-based routing."""
    IMAGE_LABELING = 'image-labeling'
    AUDIO_TRANSCRIPTION = 'audio-transcription'
    SENTIMENT_ANALYSIS = 'sentiment-analysis'
    DATA_VALIDATION = 'data-validation'
    BOUNDING_BOX = 'bounding-box'


class TaskType:
    """Supported task types."""
    IMAGE_CLASSIFICATION = 'image-classification'
    BOUNDING_BOX = 'bounding-box'
    AUDIO_TRANSCRIPTION = 'audio-transcription'
    SENTIMENT_LABELING = 'sentiment-labeling'
    DATA_VALIDATION = 'data-validation'

