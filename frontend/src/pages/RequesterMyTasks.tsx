import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';

export function RequesterMyTasks() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadMyTasks();
    }, []);

    const loadMyTasks = async () => {
        setLoading(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}tasks/my-published`, {
                method: 'GET',
                headers: {
                    'Authorization': token || '',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setTasks(data.tasks || []);
            } else {
                console.error('Failed to fetch tasks:', response.status);
                setMessage(`Error al cargar tareas: ${response.status}`);
            }
        } catch (error) {
            console.error(error);
            setMessage('Error de red al cargar tareas');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
            return;
        }

        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}tasks/${taskId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token || '',
                },
            });

            if (response.ok) {
                setMessage('Tarea eliminada exitosamente');
                loadMyTasks(); // Reload list
                setTimeout(() => setMessage(''), 3000);
            } else {
                setMessage('Error al eliminar tarea');
            }
        } catch (error) {
            console.error(error);
            setMessage('Error al eliminar tarea');
        }
    };

    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTaskTitle, setSelectedTaskTitle] = useState<string>('');

    const openReview = (taskId: string, title: string) => {
        setSelectedTaskId(taskId);
        setSelectedTaskTitle(title);
    };

    if (loading) return (
        <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Cargando tus tareas...</div>
        </div>
    );

    return (
        <div className="dashboard-container">
            <div className="header">
                <h3>Mis Tareas Publicadas</h3>
                <button className="btn-secondary" onClick={loadMyTasks}>Actualizar</button>
            </div>

            {message && <div className="status-message">{message}</div>}

            {/* Section 1: Por Revisar (Priority) */}
            <div className="section-container" style={{ marginBottom: '3rem' }}>
                <h4 style={{ color: '#fbbf24', borderBottom: '1px solid rgba(251, 191, 36, 0.3)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    ⚠️ Pendientes de Aprobación
                </h4>
                <div className="grid-layout">
                    {tasks.filter((t: any) => ['SUBMITTED', 'PENDING_QC'].includes(t.status || '')).map((task: any) => (
                        <TaskCard key={task.taskId} task={task} onOpenReview={openReview} onDelete={handleDeleteTask} />
                    ))}
                    {tasks.filter((t: any) => ['SUBMITTED', 'PENDING_QC'].includes(t.status || '')).length === 0 && (
                        <p style={{ color: 'var(--text-muted)' }}>No tienes tareas pendientes de revisión.</p>
                    )}
                </div>
            </div>

            {/* Section 2: Activas */}
            <div className="section-container" style={{ marginBottom: '3rem' }}>
                <h4 style={{ color: '#60a5fa', borderBottom: '1px solid rgba(96, 165, 250, 0.3)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    🚀 Tareas Activas (Disponibles / Asignadas)
                </h4>
                <div className="grid-layout">
                    {tasks.filter((t: any) => ['AVAILABLE', 'ASSIGNED'].includes(t.status || 'AVAILABLE')).map((task: any) => (
                        <TaskCard key={task.taskId} task={task} onOpenReview={openReview} onDelete={handleDeleteTask} />
                    ))}
                    {tasks.filter((t: any) => ['AVAILABLE', 'ASSIGNED'].includes(t.status || 'AVAILABLE')).length === 0 && (
                        <p style={{ color: 'var(--text-muted)' }}>No tienes tareas activas.</p>
                    )}
                </div>
            </div>

            {/* Section 3: Finalizadas */}
            <div className="section-container" style={{ marginBottom: '3rem' }}>
                <h4 style={{ color: '#34d399', borderBottom: '1px solid rgba(52, 211, 153, 0.3)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
                    ✅ Finalizadas / Aprobadas
                </h4>
                <div className="grid-layout">
                    {tasks.filter((t: any) => ['APPROVED', 'COMPLETED'].includes(t.status || '')).map((task: any) => (
                        <TaskCard key={task.taskId} task={task} onOpenReview={openReview} onDelete={handleDeleteTask} />
                    ))}
                    {tasks.filter((t: any) => ['APPROVED', 'COMPLETED'].includes(t.status || '')).length === 0 && (
                        <p style={{ color: 'var(--text-muted)' }}>No tienes tareas finalizadas.</p>
                    )}
                </div>
            </div>

            {selectedTaskId && (
                <SubmissionReviewModal
                    taskId={selectedTaskId}
                    taskTitle={selectedTaskTitle}
                    onClose={() => {
                        setSelectedTaskId(null);
                        loadMyTasks(); // Reload to see status updates
                    }}
                />
            )}
        </div>
    );
}

import { SubmissionReviewModal } from '../components/SubmissionReviewModal';

function TaskCard({ task, onOpenReview, onDelete }: { task: any, onOpenReview: (id: string, title: string) => void, onDelete: (id: string) => void }) {
    return (
        <div className="task-card">
            <div className="task-header">
                <div>
                    <span style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--secondary-color)',
                        fontWeight: 600
                    }}>
                        {task.category || 'General'}
                    </span>
                    <h4 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>{task.title}</h4>
                </div>
                <span className="task-reward">${task.reward}</span>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: '1.5' }}>
                {task.description}
            </p>

            <div style={{
                display: 'flex',
                gap: '1rem',
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                borderTop: 'var(--glass-border)',
                paddingTop: '1rem',
                marginBottom: '1rem'
            }}>
                <span>📅 {new Date(task.createdAt).toLocaleDateString()}</span>
                <span>📊 {task.status || 'AVAILABLE'}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Show Review button for non-available tasks OR if it is Submitted/Pending/Approved etc */}
                {(task.status && task.status !== 'AVAILABLE') && (
                    <button
                        className="btn-primary"
                        onClick={() => onOpenReview(task.taskId, task.title)}
                        style={{ width: '100%', background: '#3b82f6' }}
                    >
                        📝 {['APPROVED', 'COMPLETED'].includes(task.status) ? 'Ver Entrega' : 'Revisar Entrega'}
                    </button>
                )}

                <button
                    className="btn-secondary"
                    onClick={() => onDelete(task.taskId)}
                    style={{ width: '100%', background: 'rgba(220, 38, 38, 0.1)', color: '#ef4444' }}
                >
                    🗑️ Eliminar Tarea
                </button>
            </div>
        </div>
    );
}
