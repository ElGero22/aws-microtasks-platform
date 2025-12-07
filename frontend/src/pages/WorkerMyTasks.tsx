import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';
import { TaskMedia } from '../components/TaskMedia';

export function WorkerMyTasks() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

    const uploadMedia = async (file: File): Promise<string | null> => {
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // 1. Get Pre-signed URL
            const initResponse = await fetch(`${apiConfig.endpoint}media/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size
                })
            });

            if (!initResponse.ok) {
                throw new Error('Failed to get upload URL');
            }

            const { uploadUrl, publicUrl } = await initResponse.json();

            // 2. Upload to S3
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type
                }
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload file to S3');
            }

            return publicUrl;
        } catch (error) {
            console.error('Upload failed:', error);
            setMessage('Error uploading file.');
            return null;
        }
    };

    const handleSubmitWork = async (taskId: string, content: string) => {
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();
            const workerId = session.userSub;

            let mediaUrl = null;
            if (selectedFile) {
                setMessage('Subiendo archivo...');
                mediaUrl = await uploadMedia(selectedFile);
                if (!mediaUrl) return; // Stop if upload failed
            }

            setMessage('Enviando trabajo...');
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
                    mediaUrl: mediaUrl // Attach media URL
                }),
            });

            if (response.ok) {
                setMessage(`¡Trabajo enviado para la tarea!`);
                setTimeout(() => setMessage(''), 3000);
                loadMyTasks(); // Refresh to update status
                setSubmittingId(null);
                setSelectedFile(null); // Reset file
            } else {
                setMessage('Error al enviar el trabajo.');
            }
        } catch (error) {
            console.error(error);
            setMessage('Error de red al enviar el trabajo.');
        }
    };

    const activeTasks = tasks.filter(task => task.status === 'ASSIGNED');
    const completedTasks = tasks.filter(task => task.status !== 'ASSIGNED');

    const renderTaskCard = (task: any, isActive: boolean) => (
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        Posted by <span style={{ color: 'var(--text-color)' }}>{task.requesterName || 'Unknown'}</span>
                    </div>
                </div>
                <span className="task-reward">${task.reward}</span>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: '1.5' }}>
                {task.description}
            </p>

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
                <span>📅 Asignada: {task.assignedAt ? new Date(task.assignedAt).toLocaleDateString() : 'N/A'}</span>
                <span style={{
                    color: task.status === 'ASSIGNED' ? 'var(--primary-color)' :
                        task.status === 'PAID' ? 'var(--success-color)' : 'var(--text-muted)',
                    fontWeight: 'bold'
                }}>
                    ● {task.status || 'ASSIGNED'}
                </span>
            </div>

            {isActive ? (
                submittingId === task.taskId ? (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
                        <h5 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Entregar Trabajo</h5>
                        <textarea
                            className="form-textarea"
                            placeholder="Escribe tu respuesta aquí..."
                            rows={4}
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                            id={`submission-text-${task.taskId}`}
                        />
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Anexar Archivo / Imagen (Opcional)
                            </label>
                            <input
                                type="file"
                                style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}
                                onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                            />
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
                                onClick={() => {
                                    setSubmittingId(null);
                                    setSelectedFile(null);
                                }}
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        className="btn-primary"
                        style={{ width: '100%' }}
                        onClick={() => {
                            setSubmittingId(task.taskId);
                            setSelectedFile(null);
                        }}
                    >
                        Entregar Trabajo
                    </button>
                )
            ) : (
                <div style={{ padding: '0.5rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
                    <small>Tarea completada</small>
                </div>
            )}
        </div>
    );

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

            <h4 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Tareas Activas</h4>
            <div className="grid-layout">
                {activeTasks.length > 0 ? (
                    activeTasks.map(task => renderTaskCard(task, true))
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No tienes tareas activas.</p>
                )}
            </div>

            <h4 style={{ marginTop: '3rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Historial</h4>
            <div className="grid-layout">
                {completedTasks.length > 0 ? (
                    completedTasks.map(task => renderTaskCard(task, false))
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay tareas en el historial.</p>
                )}
            </div>
        </div>
    );
}
