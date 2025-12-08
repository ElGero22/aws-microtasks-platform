"""
Data models and status constants for the microtasks platform.
Based on the task lifecycle: Created → Published → Assigned → Submitted → Review → Approved/Rejected → Paid
"""


class TaskStatus:
    """Task lifecycle statuses."""
    CREATED = 'Created'
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
