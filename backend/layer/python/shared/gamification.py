"""
Gamification module - Worker level calculations and constants.
"""
from shared.models import WorkerLevel


# Level thresholds configuration
LEVEL_THRESHOLDS = {
    WorkerLevel.EXPERT: {
        'min_accuracy': 0.90,
        'min_tasks': 50
    },
    WorkerLevel.INTERMEDIATE: {
        'min_accuracy': 0.80,
        'min_tasks': 0
    },
    WorkerLevel.NOVICE: {
        'min_accuracy': 0.0,
        'min_tasks': 0
    }
}

# Level hierarchy for comparison (higher = more permissions)
LEVEL_HIERARCHY = {
    WorkerLevel.NOVICE: 0,
    WorkerLevel.INTERMEDIATE: 1,
    WorkerLevel.EXPERT: 2,
    # String variants for flexibility
    'Novice': 0,
    'Intermediate': 1,
    'Expert': 2,
}


def calculate_level(accuracy: float, tasks_submitted: int) -> str:
    """
    Calculate worker level based on accuracy and total tasks submitted.
    
    Rules:
    - EXPERT: accuracy > 90% AND tasks_submitted > 50
    - INTERMEDIATE: accuracy > 80%
    - NOVICE: default
    
    Args:
        accuracy: Float between 0 and 1 (tasksApproved / tasksSubmitted)
        tasks_submitted: Total number of tasks submitted
    
    Returns:
        WorkerLevel constant (NOVICE, INTERMEDIATE, or EXPERT)
    """
    if accuracy > 0.90 and tasks_submitted > 50:
        return WorkerLevel.EXPERT
    elif accuracy > 0.80:
        return WorkerLevel.INTERMEDIATE
    return WorkerLevel.NOVICE


def can_access_task(worker_level: str, required_level: str) -> bool:
    """
    Check if a worker can access a task based on level requirements.
    
    Args:
        worker_level: The worker's current level
        required_level: The task's required level
    
    Returns:
        True if worker can access the task, False otherwise
    """
    if not required_level:
        return True  # No requirement = accessible to all
    
    worker_rank = LEVEL_HIERARCHY.get(worker_level, 0)
    required_rank = LEVEL_HIERARCHY.get(required_level, 0)
    
    return worker_rank >= required_rank


def get_level_progress(accuracy: float, tasks_submitted: int, current_level: str) -> dict:
    """
    Get progress information toward next level.
    
    Args:
        accuracy: Current accuracy (0-1)
        tasks_submitted: Total tasks submitted
        current_level: Current worker level
    
    Returns:
        Dict with progress info
    """
    current_rank = LEVEL_HIERARCHY.get(current_level, 0)
    
    if current_rank >= 2:  # Already EXPERT
        return {
            'current_level': current_level,
            'next_level': None,
            'progress_pct': 100,
            'requirements_met': True
        }
    
    if current_rank == 1:  # INTERMEDIATE -> EXPERT
        next_level = WorkerLevel.EXPERT
        thresholds = LEVEL_THRESHOLDS[WorkerLevel.EXPERT]
        accuracy_progress = min(accuracy / thresholds['min_accuracy'], 1.0) * 50
        tasks_progress = min(tasks_submitted / thresholds['min_tasks'], 1.0) * 50
        progress = accuracy_progress + tasks_progress
        met = accuracy > thresholds['min_accuracy'] and tasks_submitted > thresholds['min_tasks']
    else:  # NOVICE -> INTERMEDIATE
        next_level = WorkerLevel.INTERMEDIATE
        thresholds = LEVEL_THRESHOLDS[WorkerLevel.INTERMEDIATE]
        progress = min(accuracy / thresholds['min_accuracy'], 1.0) * 100
        met = accuracy > thresholds['min_accuracy']
    
    return {
        'current_level': current_level,
        'next_level': next_level,
        'progress_pct': round(progress, 1),
        'requirements_met': met
    }
