import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';

export function WorkerMyTasks() {
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

            const response = await fetch(`${apiConfig.endpoint}tasks/my-tasks`, {
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

    if (loading) return (
        <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Cargando tus tareas...</div>
        </div>
    );

    return (
        <div className="dashboard-container">
            <div className="header">
                <h3>Mis Tareas</h3>
                <button className="btn-secondary" onClick={loadMyTasks}>Actualizar</button>
            </div>

            {message && <div className="status-message">{message}</div>}

            <div className="grid-layout">
                {tasks.map((task: any) => (
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
                                    {task.category || 'General'}
                                </span>
                                <h4 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>{task.title}</h4>
                            </div>
                            <span className="task-reward">${task.reward}</span>
                        </div>

                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: '1.5' }}>
                            {task.description}
                        </p>

                        {/* Media Preview */}
                        {task.mediaUrl && (
                            <div style={{ marginBottom: '1rem', borderRadius: '0.5rem', overflow: 'hidden', border: 'var(--glass-border)' }}>
                                {task.mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                    <img
                                        src={task.mediaUrl}
                                        alt="Contenido de la tarea"
                                        style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }}
                                    />
                                ) : task.mediaUrl.match(/\.(mp3|wav|ogg|m4a)$/i) ? (
                                    <div style={{ padding: '0.5rem', background: 'rgba(10, 14, 26, 0.5)' }}>
                                        <audio controls src={task.mediaUrl} style={{ width: '100%' }} />
                                    </div>
                                ) : null}
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            borderTop: 'var(--glass-border)',
                            paddingTop: '1rem',
                            marginBottom: '1rem'
                        }}>
                            <span>📅 Asignada: {task.assignedAt ? new Date(task.assignedAt).toLocaleDateString() : 'N/A'}</span>
                            <span>📊 {task.status || 'ASSIGNED'}</span>
                        </div>

                        <button
                            className="btn-primary"
                            style={{ width: '100%' }}
                        >
                            Ver Detalles
                        </button>
                    </div>
                ))}
            </div>

            {tasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: 'var(--glass-border)', borderRadius: '1rem' }}>
                    <p style={{ marginBottom: '1.5rem' }}>No tienes tareas asignadas aún.</p>
                    <p>
                        <a href="/worker" style={{ color: 'var(--primary-color)', fontWeight: 'bold', textDecoration: 'none' }}>
                            Ver Tareas Disponibles
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
}
