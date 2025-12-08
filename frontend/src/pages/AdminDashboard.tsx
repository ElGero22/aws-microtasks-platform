import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';
import { MetricsCard, ExportButton } from '../components/DashboardMetrics';

interface Dispute {
    disputeId: string;
    submissionId: string;
    workerId: string;
    taskId: string;
    reason: string;
    status: string;
    createdAt: string;
}

export function AdminDashboard() {
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [resolving, setResolving] = useState(false);

    // Mock data for demo purposes
    const [stats] = useState({
        openDisputes: 12,
        resolvedToday: 5,
        autoApproved: 3,
        avgResolutionTime: '2.5 hours',
        platformFees: 1250.50,
        activeWorkers: 847,
        tasksTodayTotal: 3420
    });

    useEffect(() => {
        loadDisputes();
    }, []);

    const loadDisputes = async () => {
        setLoading(true);
        try {
            // In production, this would call the API
            // For demo, using mock data
            const mockDisputes: Dispute[] = [
                {
                    disputeId: 'd-001',
                    submissionId: 's-123',
                    workerId: 'worker-456',
                    taskId: 't-789',
                    reason: 'Mi respuesta fue correcta pero fue rechazada por el sistema de consenso.',
                    status: 'Open',
                    createdAt: new Date(Date.now() - 3600000).toISOString()
                },
                {
                    disputeId: 'd-002',
                    submissionId: 's-124',
                    workerId: 'worker-457',
                    taskId: 't-790',
                    reason: 'Error en la validación AI, la imagen fue clasificada incorrectamente.',
                    status: 'Open',
                    createdAt: new Date(Date.now() - 7200000).toISOString()
                },
                {
                    disputeId: 'd-003',
                    submissionId: 's-125',
                    workerId: 'worker-458',
                    taskId: 't-791',
                    reason: 'Hubo un problema técnico durante el envío.',
                    status: 'Open',
                    createdAt: new Date(Date.now() - 86400000).toISOString()
                }
            ];
            setDisputes(mockDisputes);
        } catch (error) {
            console.error('Error loading disputes:', error);
            setMessage('Error loading disputes');
        } finally {
            setLoading(false);
        }
    };

    const handleResolve = async (disputeId: string, decision: 'APPROVE' | 'REJECT' | 'PARTIAL') => {
        setResolving(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}disputes/resolve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    disputeId,
                    decision,
                    adminNotes
                }),
            });

            if (response.ok) {
                setMessage(`Dispute ${decision.toLowerCase()}d successfully!`);
                setDisputes(prev => prev.filter(d => d.disputeId !== disputeId));
                setSelectedDispute(null);
                setAdminNotes('');
            } else {
                setMessage('Error resolving dispute');
            }
        } catch (error) {
            // For demo, just update locally
            setMessage(`Dispute ${decision.toLowerCase()}d successfully! (Demo mode)`);
            setDisputes(prev => prev.filter(d => d.disputeId !== disputeId));
            setSelectedDispute(null);
            setAdminNotes('');
        } finally {
            setResolving(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const formatTimeAgo = (dateString: string) => {
        const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
        if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    };

    if (loading) {
        return (
            <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                <div style={{ color: 'var(--text-muted)' }}>Loading admin dashboard...</div>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="header" style={{ marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, background: 'linear-gradient(135deg, #f472b6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    🛡️ Admin Dashboard
                </h2>
                <ExportButton data={disputes} filename="disputes-export" label="Export Disputes" />
            </div>

            {message && <div className="status-message">{message}</div>}

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                <MetricsCard
                    title="Open Disputes"
                    value={stats.openDisputes}
                    icon="⚠️"
                    color="warning"
                    subtitle="Pending review"
                />
                <MetricsCard
                    title="Resolved Today"
                    value={stats.resolvedToday}
                    icon="✅"
                    color="success"
                    trend={{ value: 25, isPositive: true }}
                />
                <MetricsCard
                    title="Platform Fees"
                    value={`$${stats.platformFees.toFixed(2)}`}
                    icon="💰"
                    color="primary"
                    subtitle="This month"
                />
                <MetricsCard
                    title="Active Workers"
                    value={stats.activeWorkers}
                    icon="👥"
                    color="secondary"
                    subtitle="Last 24h"
                />
            </div>

            {/* Disputes Queue */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedDispute ? '1fr 1fr' : '1fr', gap: '2rem' }}>
                {/* Disputes List */}
                <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-color)' }}>
                        📋 Dispute Queue ({disputes.length})
                    </h3>

                    {disputes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                            <p>No open disputes! All caught up.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {disputes.map((dispute) => (
                                <div
                                    key={dispute.disputeId}
                                    onClick={() => setSelectedDispute(dispute)}
                                    style={{
                                        padding: '1rem',
                                        background: selectedDispute?.disputeId === dispute.disputeId
                                            ? 'rgba(99, 102, 241, 0.15)'
                                            : 'rgba(255,255,255,0.02)',
                                        borderRadius: '0.75rem',
                                        border: selectedDispute?.disputeId === dispute.disputeId
                                            ? '1px solid var(--primary-color)'
                                            : '1px solid rgba(255,255,255,0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--primary-color)' }}>
                                            {dispute.disputeId}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '999px',
                                            background: 'rgba(245, 158, 11, 0.2)',
                                            color: '#f59e0b'
                                        }}>
                                            {dispute.status}
                                        </span>
                                    </div>
                                    <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-color)', fontSize: '0.9rem', lineHeight: 1.4 }}>
                                        {dispute.reason.length > 80 ? `${dispute.reason.substring(0, 80)}...` : dispute.reason}
                                    </p>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Worker: {dispute.workerId.substring(0, 12)}... • {formatTimeAgo(dispute.createdAt)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Dispute Details Panel */}
                {selectedDispute && (
                    <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-color)' }}>
                            🔍 Dispute Details
                        </h3>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Dispute ID</div>
                                    <div style={{ fontFamily: 'monospace', color: 'var(--primary-color)' }}>{selectedDispute.disputeId}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Submission ID</div>
                                    <div style={{ fontFamily: 'monospace' }}>{selectedDispute.submissionId}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Worker ID</div>
                                    <div style={{ fontFamily: 'monospace' }}>{selectedDispute.workerId}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Task ID</div>
                                    <div style={{ fontFamily: 'monospace' }}>{selectedDispute.taskId}</div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Worker's Reason</div>
                                <div style={{
                                    padding: '1rem',
                                    background: 'rgba(255,255,255,0.02)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    lineHeight: 1.6
                                }}>
                                    {selectedDispute.reason}
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                                    Admin Notes
                                </label>
                                <textarea
                                    className="form-textarea"
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add notes about your decision..."
                                    rows={3}
                                    style={{ marginBottom: '1rem' }}
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                className="btn-primary"
                                onClick={() => handleResolve(selectedDispute.disputeId, 'APPROVE')}
                                disabled={resolving}
                                style={{
                                    flex: 1,
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    border: 'none'
                                }}
                            >
                                ✅ Approve (100%)
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => handleResolve(selectedDispute.disputeId, 'PARTIAL')}
                                disabled={resolving}
                                style={{ flex: 1, background: 'rgba(245, 158, 11, 0.2)', borderColor: '#f59e0b' }}
                            >
                                ⚡ Partial (50%)
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => handleResolve(selectedDispute.disputeId, 'REJECT')}
                                disabled={resolving}
                                style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444' }}
                            >
                                ❌ Reject
                            </button>
                        </div>

                        <button
                            className="btn-secondary"
                            onClick={() => setSelectedDispute(null)}
                            style={{ width: '100%', marginTop: '0.75rem' }}
                        >
                            Close Details
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
