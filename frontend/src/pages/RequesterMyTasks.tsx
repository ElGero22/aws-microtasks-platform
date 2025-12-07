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

                        <button
                            className="btn-secondary"
                            onClick={() => handleDeleteTask(task.taskId)}
                            style={{ width: '100%', background: 'rgba(220, 38, 38, 0.1)', color: '#ef4444' }}
                        >
                            🗑️ Eliminar Tarea
                        </button>
                    </div>
                ))}
            </div>

            {tasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: 'var(--glass-border)', borderRadius: '1rem' }}>
                    <p style={{ marginBottom: '1.5rem' }}>No has publicado ninguna tarea aún.</p>
                    <p>
                        <a href="/requester" style={{ color: 'var(--primary-color)', fontWeight: 'bold', textDecoration: 'none' }}>
                            Ir a Crear Tarea
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
}
