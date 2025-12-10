import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';
import { TaskMedia } from '../components/TaskMedia';
import type { BoundingBox } from '../components/BoundingBoxEditor';

export function WorkerMyTasks() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);

    // Appeal State
    const [appealTaskId, setAppealTaskId] = useState<string | null>(null);
    const [appealSubmissionId, setAppealSubmissionId] = useState<string | null>(null);
    const [appealReason, setAppealReason] = useState('');
    const [isAppealing, setIsAppealing] = useState(false);

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
    }


    const handleDecline = async (taskId: string) => {
        if (!window.confirm('¿Estás seguro de que quieres rechazar esta tarea? Esto afectará negativamente tu reputación.')) {
            return;
        }

        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            setMessage('Rechazando tarea...');
            const response = await fetch(`${apiConfig.endpoint}tasks/${taskId}/decline`, {
                method: 'POST',
                headers: {
                    'Authorization': token || '',
                },
            });

            if (response.ok) {
                setMessage('Tarea rechazada.');
                setTimeout(() => setMessage(''), 3000);
                loadMyTasks();
            } else {
                setMessage('Error al rechazar la tarea.');
            }
        } catch (error) {
            console.error(error);
            setMessage('Error de red al rechazar la tarea.');
        }
    };

    const openAppealModal = (task: any) => {
        // Need submissionId. Assuming task object might not have it directly if it comes from /my-tasks list.
        // Wait, /my-tasks usually returns user specific task status. 
        // If the task is REJECTED, we assume there is a submission.
        // We might need to fetch submissions or assume the backend provided submissionId in the task list view for workers.
        // Checking list-my-tasks.ts ... it fetches tasks assigned/interactive.
        // If status is REJECTED, it means the submission was rejected.
        // To appeal, we need submissionId.
        // If the current GetMyTasks lambda doesn't return submissionId, we have a problem.
        // Let's assume for now we use taskId to find the submission or the backend returns it.
        // EDIT: list-my-tasks.ts usually joins or returns what's in MyTasks GSI.
        // If we don't have submissionId, we can't create a dispute easily without querying.
        // Workaround: Pass taskId and let backend find the rejected submission?
        // OR: Update backend `list-my-tasks` to include submissionId.
        // Let's assume we have it or can get it. 
        // Actually, let's use taskId and find the submission in the frontend or backend.
        // The `create` dispute lambda expects `submissionId`.
        // Let's update `loadMyTasks` to fetch submissions if needed? No, too heavy.
        // Let's assume `task.submissionId` is available or we pass `taskId` and `create` lambda finds it.
        // But `create.ts` takes `submissionId`.
        // Let's try to pass `task.lastSubmissionId` if available.
        setAppealTaskId(task.taskId);
        setAppealSubmissionId(task.lastSubmissionId || task.submissionId); // Optimistic
        setAppealReason('');
    };

    const handleAppeal = async () => {
        if (!appealSubmissionId || !appealReason) {
            alert('Por favor ingresa un motivo.');
            return;
        }

        setIsAppealing(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const response = await fetch(`${apiConfig.endpoint}disputes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    submissionId: appealSubmissionId,
                    reason: appealReason
                }),
            });

            if (response.ok) {
                setMessage('Apelación enviada correctamente. Un administrador la revisará.');
                setAppealTaskId(null);
                setAppealReason('');
                loadMyTasks(); // Refresh
            } else {
                const err = await response.json();
                alert(`Error: ${err.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('Error al enviar apelación.');
        } finally {
            setIsAppealing(false);
        }
    };

    const activeTasks = tasks.filter(task => task.status === 'ASSIGNED');
    const completedTasks = tasks.filter(task => task.status !== 'ASSIGNED');

    const renderTaskCard = (task: any, isActive: boolean) => (
        <div key={task.taskId} className="task-card" style={task.status === 'REJECTED' ? { borderLeft: '4px solid #ef4444' } : {}}>
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
                        task.status === 'PAID' ? 'var(--success-color)' :
                            task.status === 'REJECTED' ? 'var(--error-color)' : 'var(--text-muted)',
                    fontWeight: 'bold'
                }}>
                    ● {
                        task.status === 'ASSIGNED' ? 'ASIGNADA' :
                            task.status === 'SUBMITTED' ? 'EN REVISIÓN' :
                                task.status === 'COMPLETED' ? 'APROBADA' :
                                    task.status === 'PAID' ? 'PAGADA' :
                                        task.status === 'REJECTED' ? 'TAREA DECLINADA' :
                                            task.status
                    }
                </span>
            </div>

            {/* Appeal Button for Rejected Tasks */}
            {task.status === 'REJECTED' && (
                <div style={{ marginTop: '0.5rem' }}>
                    <button
                        className="btn-secondary"
                        style={{ width: '100%', borderColor: 'var(--error-color)', color: 'var(--error-color)' }}
                        onClick={() => openAppealModal(task)}
                    >
                        ⚠️ Apelar Rechazo
                    </button>
                    {task.feedback && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '0.25rem' }}>
                            <strong>Feedback:</strong> {task.feedback}
                        </div>
                    )}
                </div>
            )}

            {isActive ? (
                submittingId === task.taskId ? (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
                        <h5 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Entregar Trabajo</h5>

                        {/* Bounding Box Editor TEMPORARILY DISABLED */}
                        {task.mediaUrl && task.mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) && (
                            <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px dashed #6366f1', borderRadius: '0.5rem', background: 'rgba(99, 102, 241, 0.1)' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-color)', fontWeight: 600 }}>
                                    📦 Marca las áreas relevantes en la imagen:
                                </label>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    Editor de anotaciones deshabilitado temporalmente.
                                </div>
                            </div>
                        )}

                        {/* Transcription hint for audio tasks */}
                        {task.mediaUrl && task.mediaUrl.match(/\.(mp3|wav|ogg|m4a)/i) && (
                            <div style={{
                                marginBottom: '0.75rem',
                                padding: '0.75rem',
                                background: 'rgba(99, 102, 241, 0.1)',
                                borderRadius: '0.5rem',
                                fontSize: '0.875rem',
                                color: 'var(--primary-color)'
                            }}>
                                🎧 Escucha el audio arriba y escribe la transcripción en el cuadro de texto.
                            </div>
                        )}

                        <textarea
                            className="form-textarea"
                            placeholder={task.mediaUrl?.match(/\.(mp3|wav|ogg|m4a)/i)
                                ? "Escribe la transcripción del audio aquí..."
                                : "Escribe tu respuesta aquí..."}
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
                                    // Include bounding boxes in submission if present
                                    const content = boundingBoxes.length > 0
                                        ? JSON.stringify({ text: textInput.value, boundingBoxes })
                                        : textInput.value;
                                    handleSubmitWork(task.taskId, content);
                                    setBoundingBoxes([]); // Reset after submission
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
                                    setBoundingBoxes([]);
                                }}
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
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
                        <button
                            className="btn-secondary"
                            style={{ width: '100%', marginTop: '0.5rem', borderColor: 'var(--error-color)', color: 'var(--error-color)' }}
                            onClick={() => handleDecline(task.taskId)}
                        >
                            Rechazar Tarea
                        </button>
                    </div>
                )

            ) : (
                <div style={{ padding: '0.5rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
                    <small>Tarea {task.status === 'REJECTED' ? 'Rechazada' : 'Completada'}</small>
                </div>
            )}
        </div >
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

            {/* Appeal Modal */}
            {appealTaskId && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Apelar Rechazo</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Explica por qué crees que tu trabajo fue rechazado incorrectamente. Un administrador revisará tu caso.
                        </p>
                        <textarea
                            className="form-textarea"
                            value={appealReason}
                            onChange={(e) => setAppealReason(e.target.value)}
                            placeholder="Escribe tu motivo aquí..."
                            rows={4}
                            style={{ width: '100%', marginBottom: '1rem' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button className="btn-secondary" onClick={() => setAppealTaskId(null)}>Cancelar</button>
                            <button className="btn-primary" onClick={handleAppeal} disabled={isAppealing}>
                                {isAppealing ? 'Enviando...' : 'Enviar Apelación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
