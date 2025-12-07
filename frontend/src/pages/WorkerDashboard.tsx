import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';
import { TaskMedia } from '../components/TaskMedia';

export function WorkerDashboard() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submissionMessage, setSubmissionMessage] = useState('');
    const [submittingId, setSubmittingId] = useState<string | null>(null);


    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        setLoading(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}tasks`, {
                method: 'GET',
                headers: {
                    'Authorization': token || '',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setTasks(data.tasks || []);
            } else {
                console.error('Failed to fetch tasks:', response.status, response.statusText);
                setSubmissionMessage(`Error fetching tasks: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error(error);
            setSubmissionMessage('Network error fetching tasks');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitWork = async (taskId: string, content: string) => {
        setSubmittingId(taskId);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();
            const workerId = session.userSub;

            const response = await fetch(`${apiConfig.endpoint}submissions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    taskId,
                    workerId,
                    content: content || 'No text content provided',
                }),
            });

            if (response.ok) {
                setSubmissionMessage(`Work submitted for task!`);
                setTimeout(() => setSubmissionMessage(''), 3000);
            } else {
                setSubmissionMessage('Failed to submit work.');
            }
        } catch (error) {
            console.error(error);
            setSubmissionMessage('Error submitting work.');
        } finally {
            setSubmittingId(null);
        }
    };

    const handleAssign = async (taskId: string) => {
        console.log(`Attempting to assign task ${taskId}...`);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();
            const workerId = session.userSub;
            console.log('Worker ID:', workerId);

            const url = `${apiConfig.endpoint}tasks/assign`;
            console.log('Fetching:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    taskId,
                    workerId
                }),
            });
            console.log('Response status:', response.status);

            if (response.ok) {
                console.log('Assignment successful');
                setSubmissionMessage('¡Tarea asignada con éxito! Puedes empezar a trabajar.');
                loadTasks(); // Refresh list to remove the assigned task from "Available"
                setSubmittingId(taskId);
            } else {
                const errorText = await response.text();
                console.error('Assignment failed:', errorText);
                setSubmissionMessage(`Error al asignar la tarea: ${response.status}`);
            }
        } catch (error) {
            console.error('Error assigning task:', error);
            setSubmissionMessage('Error de red al asignar tarea.');
        }
    };

    if (loading) return (
        <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Cargando tareas disponibles...</div>
        </div>
    );

    return (
        <div className="dashboard-container">
            <div className="header">
                <h3>Tareas Disponibles</h3>
                <button className="btn-secondary" onClick={loadTasks}>Actualizar Lista</button>
            </div>

            {submissionMessage && <div className="status-message">{submissionMessage}</div>}

            <div className="grid-layout">
                {tasks.filter((task: any) => task.status === 'AVAILABLE').map((task: any) => (
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
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            {task.description}
                        </p>

                        {/* Media Preview */}
                        <TaskMedia mediaUrl={task.mediaUrl} />

                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            borderTop: 'var(--glass-border)',
                            paddingTop: '1rem',
                            marginBottom: '1rem'
                        }}>
                            <span>⏱ {task.timeLimit || 30} mins</span>
                            <span>⚡ {task.complexity || 'Low'} Complexity</span>
                        </div>

                        {submittingId === task.taskId ? (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
                                <h5 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Enviar tu Trabajo</h5>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Escribe tu respuesta aquí (ej. texto de transcripción)..."
                                    rows={4}
                                    style={{ width: '100%', marginBottom: '0.5rem' }}
                                    id={`submission-text-${task.taskId}`}
                                />
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Subir Archivo (Opcional)
                                    </label>
                                    <input type="file" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className="btn-primary"
                                        onClick={() => {
                                            const textInput = document.getElementById(`submission-text-${task.taskId}`) as HTMLTextAreaElement;
                                            handleSubmitWork(task.taskId, textInput.value);
                                        }}
                                        style={{ flex: 1 }}
                                    >
                                        Enviar
                                    </button>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => setSubmittingId(null)}
                                        style={{ padding: '0.5rem 1rem' }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                className="btn-primary"
                                onClick={() => handleAssign(task.taskId)}
                                style={{ width: '100%' }}
                            >
                                Iniciar / Enviar Trabajo
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {tasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: 'var(--glass-border)', borderRadius: '1rem' }}>
                    <p style={{ marginBottom: '1.5rem' }}>No hay tareas disponibles en este momento.</p>
                    <p>
                        ¿Buscas publicar una tarea? <br />
                        <a href="/requester" style={{ color: 'var(--primary-color)', fontWeight: 'bold', textDecoration: 'none' }}>
                            Cambiar al Panel de Solicitante
                        </a>
                    </p>
                </div>
            )}


        </div>
    );
}
