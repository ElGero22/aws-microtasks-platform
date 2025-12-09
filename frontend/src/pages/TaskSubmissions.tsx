import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';

interface Submission {
    submissionId: string;
    taskId: string;
    workerId: string;
    status: string;
    result: string;
    submittedAt: string;
    feedback?: string;
}

export function TaskSubmissions() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (taskId) {
            loadSubmissions();
        }
    }, [taskId]);

    const loadSubmissions = async () => {
        setLoading(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}tasks/${taskId}/submissions`, {
                method: 'GET',
                headers: {
                    'Authorization': token || '',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setSubmissions(data.submissions || []);
            } else {
                setMessage('Failed to load submissions');
            }
        } catch (error) {
            console.error('Error loading submissions:', error);
            setMessage('Error loading submissions');
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (submissionId: string, decision: 'APPROVE' | 'REJECT') => {
        setActionLoading(submissionId);
        let reason = '';

        if (decision === 'REJECT') {
            reason = prompt('Please provide a reason for rejection:') || '';
            if (!reason) {
                setActionLoading(null);
                return; // User cancelled
            }
        }

        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}submissions/${submissionId}/review`, {
                method: 'POST',
                headers: {
                    'Authorization': token || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ decision, reason })
            });

            if (response.ok) {
                setMessage(`Submission ${decision.toLowerCase()}d successfully`);
                // Update local state
                setSubmissions(prev => prev.map(s =>
                    s.submissionId === submissionId
                        ? { ...s, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', feedback: reason }
                        : s
                ));
            } else {
                setMessage('Failed to submit review');
            }
        } catch (error) {
            console.error('Error reviewing submission:', error);
            setMessage('Error reviewing submission');
        } finally {
            setActionLoading(null);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    if (loading) {
        return <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>Loading submissions...</div>;
    }

    return (
        <div className="dashboard-container">
            <div className="header" style={{ marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/requester')}
                    className="btn-secondary"
                    style={{ marginRight: '1rem' }}
                >
                    ← Back to Dashboard
                </button>
                <h2 style={{ margin: 0, display: 'inline-block' }}>Task Submissions</h2>
            </div>

            {message && <div className="status-message">{message}</div>}

            <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Submissions for Task: {taskId}</h3>

                {submissions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No submissions yet.
                    </div>
                ) : (
                    <div className="submissions-list">
                        {submissions.map(sub => (
                            <div key={sub.submissionId} style={{
                                padding: '1rem',
                                marginBottom: '1rem',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                borderRadius: '0.5rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ marginBottom: '0.5rem' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Worker: </span>
                                        <span style={{ fontFamily: 'monospace' }}>{sub.workerId}</span>
                                    </div>
                                    <div style={{ marginBottom: '0.5rem' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Result:</div>
                                        <div>{sub.result}</div>
                                    </div>
                                    <div>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            background: sub.status === 'APPROVED' ? 'rgba(34, 197, 94, 0.2)' :
                                                sub.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.2)' :
                                                    'rgba(245, 158, 11, 0.2)',
                                            color: sub.status === 'APPROVED' ? '#4ade80' :
                                                sub.status === 'REJECTED' ? '#f87171' :
                                                    '#fbbf24'
                                        }}>
                                            {sub.status}
                                        </span>
                                    </div>
                                </div>

                                {sub.status === 'SUBMITTED' && (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => handleReview(sub.submissionId, 'APPROVE')}
                                            disabled={!!actionLoading}
                                            className="btn-primary"
                                            style={{ backgroundColor: '#22c55e', borderColor: '#22c55e' }}
                                        >
                                            {actionLoading === sub.submissionId ? '...' : 'Approve'}
                                        </button>
                                        <button
                                            onClick={() => handleReview(sub.submissionId, 'REJECT')}
                                            disabled={!!actionLoading}
                                            className="btn-secondary"
                                            style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                        >
                                            {actionLoading === sub.submissionId ? '...' : 'Reject'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
