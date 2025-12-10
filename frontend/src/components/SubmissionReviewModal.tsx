import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';

import { TaskMedia } from './TaskMedia';

interface Submission {
    submissionId: string;
    taskId: string;
    workerId: string;
    content: string; // Text content or JSON
    mediaUrl?: string;
    status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING_QC';
    submittedAt: string;
}

interface SubmissionReviewModalProps {
    taskId: string;
    taskTitle: string;
    onClose: () => void;
}

export function SubmissionReviewModal({ taskId, taskTitle, onClose }: SubmissionReviewModalProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null); // submissionId being processed
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        loadSubmissions();
    }, [taskId]);

    const loadSubmissions = async () => {
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();
            const response = await fetch(`${apiConfig.endpoint}tasks/${taskId}/submissions`, {
                headers: { Authorization: token || '' }
            });
            if (response.ok) {
                const data = await response.json();
                setSubmissions(data.submissions || []);
            }
        } catch (error) {
            console.error('Error loading submissions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (submissionId: string, decision: 'APPROVE' | 'REJECT') => {
        setProcessing(submissionId);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}submissions/${submissionId}/review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token || ''
                },
                body: JSON.stringify({
                    decision,
                    reason: decision === 'APPROVE' ? 'Great work!' : 'Does not meet requirements.'
                })
            });

            if (response.ok) {
                // Update local state
                setSubmissions(prev => prev.map(sub =>
                    sub.submissionId === submissionId
                        ? { ...sub, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' }
                        : sub
                ));
            } else {
                alert('Failed to submit review');
            }
        } catch (error) {
            console.error('Error reviewing submission:', error);
            alert('Error reviewing submission');
        } finally {
            setProcessing(null);
            setEditingId(null);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000, backdropFilter: 'blur(5px)'
        }}>
            <div style={{
                background: '#1e293b', padding: '2rem', borderRadius: '1rem',
                width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}>Reviews: {taskTitle}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
                </div>

                {loading ? <p>Loading submissions...</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {submissions.length === 0 && <p style={{ color: '#94a3b8' }}>No submissions yet.</p>}
                        {submissions.map(sub => (
                            <div key={sub.submissionId} style={{
                                background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '0.5rem',
                                borderLeft: `4px solid ${sub.status === 'APPROVED' ? '#22c55e' : sub.status === 'REJECTED' ? '#ef4444' : '#fbbf24'}`
                            }}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                                        From: Worker {sub.workerId.substring(0, 8)} • {new Date(sub.submittedAt).toLocaleDateString()}
                                    </div>

                                    {/* Display Attached Media */}
                                    {sub.mediaUrl && (
                                        <div style={{ marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                            <TaskMedia mediaUrl={sub.mediaUrl} />
                                        </div>
                                    )}

                                    <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '0.5rem', fontFamily: 'monospace' }}>
                                        {sub.content}
                                    </div>
                                </div>

                                {(['SUBMITTED', 'PENDING_QC'].includes(sub.status) || editingId === sub.submissionId) ? (
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button
                                            onClick={() => handleReview(sub.submissionId, 'APPROVE')}
                                            disabled={!!processing}
                                            className="btn-primary"
                                            style={{ backgroundColor: '#22c55e' }}
                                        >
                                            {processing === sub.submissionId ? 'Processing...' : '✅ Approve & Pay'}
                                        </button>
                                        <button
                                            onClick={() => handleReview(sub.submissionId, 'REJECT')}
                                            disabled={!!processing}
                                            className="btn-secondary"
                                            style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                        >
                                            ❌ Reject
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{
                                            color: sub.status === 'APPROVED' ? '#22c55e' : '#ef4444',
                                            fontWeight: 'bold'
                                        }}>
                                            {sub.status}
                                        </span>
                                        <button
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #475569',
                                                color: '#cbd5e1',
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '0.25rem',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem'
                                            }}
                                            onClick={() => setEditingId(sub.submissionId)}
                                        >
                                            ✏️ Edit Decision
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
