"""
Authentication utilities for extracting user info from Cognito tokens.
"""
from typing import Optional


def get_user_sub(event: dict) -> Optional[str]:
    """
    Extract user sub (unique ID) from Cognito authorizer claims.
    
    Args:
        event: API Gateway Lambda proxy event
        
    Returns:
        User sub string or None if not authenticated
    """
    try:
        return event['requestContext']['authorizer']['claims']['sub']
    except (KeyError, TypeError):
        return None


def get_user_email(event: dict) -> Optional[str]:
    """Extract user email from Cognito claims."""
    try:
        return event['requestContext']['authorizer']['claims']['email']
    except (KeyError, TypeError):
        return None


def get_user_groups(event: dict) -> list:
    """Extract user groups (requester, worker, admin) from Cognito claims."""
    try:
        groups = event['requestContext']['authorizer']['claims'].get('cognito:groups', '')
        if isinstance(groups, str):
            return groups.split(',') if groups else []
        return groups or []
    except (KeyError, TypeError):
        return []


def is_admin(event: dict) -> bool:
    """Check if user belongs to admin group."""
    return 'admin' in get_user_groups(event)


def is_requester(event: dict) -> bool:
    """Check if user belongs to requester group."""
    return 'requester' in get_user_groups(event)


def is_worker(event: dict) -> bool:
    """Check if user belongs to worker group."""
    return 'worker' in get_user_groups(event)
