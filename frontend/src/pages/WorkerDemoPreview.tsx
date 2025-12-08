import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dashboard.css';
import { MetricsCard, EarningsBreakdown, Leaderboard, PerformanceChart } from '../components/DashboardMetrics';
import { TaskMedia } from '../components/TaskMedia';

// Demo data for preview
const demoTasks = [
    {
        taskId: 'demo-1',
        title: 'Classify Dog Breed in Image',
        description: 'Look at the provided image and classify the dog breed from the given options.',
        category: 'Image Classification',
        reward: '0.50',
        status: 'AVAILABLE',
        requesterName: 'Carlos Research Lab',
        timeLimit: 30,
        complexity: 'Low',
        mediaUrl: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400'
    },
    {
        taskId: 'demo-2',
        title: 'Transcribe Audio Clip',
        description: 'Listen to the audio file and transcribe the spoken words accurately.',
        category: 'Audio Transcription',
        reward: '1.25',
        status: 'AVAILABLE',
        requesterName: 'Voice Data Inc',
        timeLimit: 45,
        complexity: 'Medium',
    },
    {
        taskId: 'demo-3',
        title: 'Sentiment Analysis - Tweet',
        description: 'Analyze the sentiment of the following tweet and classify it as positive, negative, or neutral.',
        category: 'Text Analysis',
        reward: '0.30',
        status: 'AVAILABLE',
        requesterName: 'Social Insights',
        timeLimit: 15,
        complexity: 'Low',
    },
    {
        taskId: 'demo-4',
        title: 'Draw Bounding Box on Object',
        description: 'Draw a bounding box around the main object (car) in the provided image.',
        category: 'Bounding Box',
        reward: '0.75',
        status: 'AVAILABLE',
        requesterName: 'Auto Vision AI',
        timeLimit: 20,
        complexity: 'Medium',
        mediaUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400'
    },
];

const workerStats = {
    earnings: { today: 12.50, week: 87.25, month: 342.00, total: 1245.75 },
    tasksCompleted: 156,
    accuracy: 94.2,
    level: 'Expert',
    weeklyData: [
        { date: 'Mon', value: 15 },
        { date: 'Tue', value: 22 },
        { date: 'Wed', value: 18 },
        { date: 'Thu', value: 25 },
        { date: 'Fri', value: 31 },
        { date: 'Sat', value: 12 },
        { date: 'Sun', value: 8 },
    ],
    leaderboard: [
        { rank: 1, name: 'Carlos M.', earnings: 425.50, tasksCompleted: 312, accuracy: 98.5 },
        { rank: 2, name: 'María L.', earnings: 380.25, tasksCompleted: 287, accuracy: 97.2 },
        { rank: 3, name: 'Tú', earnings: 342.00, tasksCompleted: 256, accuracy: 96.8, isCurrentUser: true },
        { rank: 4, name: 'Ana S.', earnings: 298.75, tasksCompleted: 234, accuracy: 95.5 },
        { rank: 5, name: 'Luis R.', earnings: 267.50, tasksCompleted: 198, accuracy: 94.1 },
    ]
};

export function WorkerDemoPreview() {
    const [showStats, setShowStats] = useState(true);
    const [selectedTask, setSelectedTask] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'available' | 'my-tasks'>('available');

    return (
        <div style={{ width: '100%', minHeight: '100vh', background: 'var(--background-color)' }}>
            {/* Demo Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
                padding: '0.75rem 2rem',
                textAlign: 'center',
                borderBottom: 'var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    🎨 <strong>Vista de Demostración</strong> - Esta es una preview de la interfaz del Worker
                </span>
                <Link to="/worker" className="btn-primary" style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                    Ir al Login Real →
                </Link>
            </div>

            {/* Header */}
            <div className="header" style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)' }}>
                <h2>Panel de Trabajador</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: '#10b981',
                        padding: '0.5rem 1rem',
                        borderRadius: '2rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <span>💰</span>
                        <span>${workerStats.earnings.total.toFixed(2)}</span>
                    </div>
                    <Link to="/requester/demo" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>Cambiar a Requester</Link>
                    <span style={{ color: 'var(--text-muted)' }}>Hola, <strong>Juan Demo</strong></span>
                    <button className="btn-secondary">Cerrar sesión</button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)', display: 'flex', gap: '1rem' }}>
                <button
                    onClick={() => setActiveTab('available')}
                    className={activeTab === 'available' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.5rem 1.5rem' }}
                >
                    Tareas Disponibles
                </button>
                <button
                    onClick={() => setActiveTab('my-tasks')}
                    className={activeTab === 'my-tasks' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.5rem 1.5rem' }}
                >
                    Mis Tareas
                </button>
            </div>

            <div className="dashboard-container">
                {/* Stats Section */}
                {showStats && (
                    <div style={{ marginBottom: '2rem' }}>
                        {/* Quick Stats Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            <MetricsCard
                                title="Today's Earnings"
                                value={`$${workerStats.earnings.today.toFixed(2)}`}
                                icon="💰"
                                color="success"
                                trend={{ value: 15, isPositive: true }}
                            />
                            <MetricsCard
                                title="Tasks Completed"
                                value={workerStats.tasksCompleted}
                                icon="✅"
                                color="primary"
                                subtitle="All time"
                            />
                            <MetricsCard
                                title="Accuracy Rate"
                                value={`${workerStats.accuracy}%`}
                                icon="🎯"
                                color="secondary"
                            />
                            <MetricsCard
                                title="Worker Level"
                                value={workerStats.level}
                                icon="⭐"
                                color="warning"
                            />
                        </div>

                        {/* Detailed Stats Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                            <EarningsBreakdown {...workerStats.earnings} />
                            <PerformanceChart data={workerStats.weeklyData} title="Tasks This Week" color="#22c55e" />
                            <Leaderboard entries={workerStats.leaderboard} />
                        </div>

                        <button
                            onClick={() => setShowStats(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                marginTop: '1rem',
                                fontSize: '0.8rem'
                            }}
                        >
                            ▲ Hide Stats
                        </button>
                    </div>
                )}

                {!showStats && (
                    <button
                        onClick={() => setShowStats(true)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            marginBottom: '1rem',
                            fontSize: '0.8rem'
                        }}
                    >
                        ▼ Show Stats
                    </button>
                )}

                {activeTab === 'available' && (
                    <>
                        <div className="header">
                            <h3>Tareas Disponibles</h3>
                            <button className="btn-secondary">Actualizar Lista</button>
                        </div>

                        <div className="grid-layout">
                            {demoTasks.map((task) => (
                                <div key={task.taskId} className="task-card">
                                    <div className="task-header">
                                        <div>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                color: 'var(--secondary-color)',
                                                fontWeight: 600
                                            }}>
                                                {task.category}
                                            </span>
                                            <h4 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>{task.title}</h4>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                                Posted by <span style={{ color: 'var(--text-color)' }}>{task.requesterName}</span>
                                            </div>
                                        </div>
                                        <span className="task-reward">${task.reward}</span>
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                        {task.description}
                                    </p>

                                    {/* Media Preview */}
                                    {task.mediaUrl && <TaskMedia mediaUrl={task.mediaUrl} />}

                                    <div style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        fontSize: '0.875rem',
                                        color: 'var(--text-muted)',
                                        borderTop: 'var(--glass-border)',
                                        paddingTop: '1rem',
                                        marginBottom: '1rem'
                                    }}>
                                        <span>⏱ {task.timeLimit} mins</span>
                                        <span>⚡ {task.complexity} Complexity</span>
                                    </div>

                                    {selectedTask === task.taskId ? (
                                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
                                            <h5 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Enviar tu Trabajo</h5>
                                            <textarea
                                                className="form-textarea"
                                                placeholder="Escribe tu respuesta aquí..."
                                                rows={4}
                                                style={{ width: '100%', marginBottom: '0.5rem' }}
                                            />
                                            <div style={{ marginBottom: '1rem' }}>
                                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    Subir Archivo (Opcional)
                                                </label>
                                                <input type="file" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }} />
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn-primary" style={{ flex: 1 }}>
                                                    Enviar
                                                </button>
                                                <button
                                                    className="btn-secondary"
                                                    onClick={() => setSelectedTask(null)}
                                                    style={{ padding: '0.5rem 1rem' }}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            className="btn-primary"
                                            onClick={() => setSelectedTask(task.taskId)}
                                            style={{ width: '100%' }}
                                        >
                                            Iniciar / Enviar Trabajo
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'my-tasks' && (
                    <>
                        <div className="header">
                            <h3>Mis Tareas</h3>
                        </div>

                        <div className="grid-layout">
                            {/* Demo completed tasks */}
                            <div className="task-card" style={{ borderLeft: '4px solid #22c55e' }}>
                                <div className="task-header">
                                    <div>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            color: '#22c55e',
                                            fontWeight: 600
                                        }}>
                                            ✅ COMPLETADA
                                        </span>
                                        <h4 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>Sentiment Analysis - Review</h4>
                                    </div>
                                    <span className="task-reward" style={{ color: '#22c55e' }}>+ $0.45</span>
                                </div>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                    Completed 2 hours ago • Accuracy: 100%
                                </p>
                            </div>

                            <div className="task-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                                <div className="task-header">
                                    <div>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            color: '#f59e0b',
                                            fontWeight: 600
                                        }}>
                                            ⏳ PENDING REVIEW
                                        </span>
                                        <h4 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>Image Labeling - Cars</h4>
                                    </div>
                                    <span className="task-reward">$0.75</span>
                                </div>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                    Submitted 30 minutes ago • Awaiting consensus
                                </p>
                            </div>

                            <div className="task-card" style={{ borderLeft: '4px solid #6366f1' }}>
                                <div className="task-header">
                                    <div>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            color: '#6366f1',
                                            fontWeight: 600
                                        }}>
                                            🔄 IN PROGRESS
                                        </span>
                                        <h4 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>Audio Transcription</h4>
                                    </div>
                                    <span className="task-reward">$1.25</span>
                                </div>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                    Time remaining: 23 minutes
                                </p>
                                <button className="btn-primary" style={{ width: '100%' }}>
                                    Continue Working
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
