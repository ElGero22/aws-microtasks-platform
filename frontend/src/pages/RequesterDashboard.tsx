import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';
import '../styles/dashboard.css';
import { MetricsCard, BudgetTracker, PerformanceChart, ExportButton } from '../components/DashboardMetrics';
import { SubmissionReviewModal } from '../components/SubmissionReviewModal';

export function RequesterDashboard() {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        reward: '',
        category: 'Data Entry',
        timeLimit: '30',
        complexity: 'Low',
        mediaUrl: ''
    });

    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showStats, setShowStats] = useState(true);

    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTaskTitle, setSelectedTaskTitle] = useState<string>('');

    // Mock stats for demo
    const [requesterStats, setRequesterStats] = useState({
        budget: { totalBudget: 0, spent: 0, pending: 0 },
        tasksPublished: 0,
        tasksCompleted: 0,
        avgQuality: 0,
        throughput: 0,
        weeklyData: [] as { date: string, value: number }[],
        recentTasks: [] as any[]
    });

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
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
                const myTasks = data.tasks || [];
                calculateStats(myTasks);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const calculateStats = (myTasks: any[]) => {
        let totalBudget = 0;
        let spent = 0;
        let pending = 0;
        let completed = 0;

        // Weekly data map initialization
        const weeklyDataMap = new Map<string, number>();
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        days.forEach(d => weeklyDataMap.set(d, 0));

        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))).getTime();

        myTasks.forEach(task => {
            const reward = parseFloat(task.reward) || 0;
            totalBudget += reward; // Assuming total budget is sum of all task rewards (commitment)

            if (['PAID', 'COMPLETED', 'APPROVED'].includes(task.status)) {
                spent += reward;
                completed++;
            } else {
                pending += reward;
            }

            // Weekly Activity (Tasks Published)
            const taskDate = new Date(task.createdAt || Date.now());
            if (taskDate.getTime() >= startOfWeek) {
                const dayName = taskDate.toLocaleDateString('en-US', { weekday: 'short' });
                if (weeklyDataMap.has(dayName)) {
                    weeklyDataMap.set(dayName, (weeklyDataMap.get(dayName) || 0) + 1);
                }
            }
        });

        const weeklyData = days.map(day => ({ date: day, value: weeklyDataMap.get(day) || 0 }));

        // Recent Tasks (Sort by createdAt desc and take top 5)
        const recentTasks = [...myTasks]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5)
            .map(t => ({
                taskId: t.taskId,
                title: t.title,
                status: t.status,
                submissions: 0, // Need separate API for submissions count if not in task object
                approved: 0
            }));

        setRequesterStats({
            budget: { totalBudget, spent, pending },
            tasksPublished: myTasks.length,
            tasksCompleted: completed,
            avgQuality: 0, // Placeholder
            throughput: 0, // Placeholder
            weeklyData,
            recentTasks
        });
    };

    // Cleanup preview URL to avoid memory leaks
    useEffect(() => {
        return () => {
            if (mediaPreviewUrl) {
                URL.revokeObjectURL(mediaPreviewUrl);
            }
        };
    }, [mediaPreviewUrl]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setMediaFile(file);
            setMediaPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleFileUpload = async (file: File): Promise<string> => {
        setIsUploading(true);
        setUploadProgress(0);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // Request pre-signed URL from backend
            const uploadResponse = await fetch(`${apiConfig.endpoint}media/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                }),
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to get upload URL');
            }

            const { uploadUrl, publicUrl } = await uploadResponse.json();

            // Upload file to S3 using pre-signed URL
            const uploadToS3 = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type,
                },
                body: file,
            });

            if (!uploadToS3.ok) {
                throw new Error('Failed to upload file');
            }

            setUploadProgress(100);
            return publicUrl;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // Upload file if selected
            let mediaUrl = (formData as any).mediaUrl || '';
            if (mediaFile && !mediaUrl) {
                try {
                    mediaUrl = await handleFileUpload(mediaFile);
                    setMessage('Archivo subido exitosamente. Creando tarea...');
                } catch (error) {
                    setMessage('Error al subir archivo. Intenta con una URL directa.');
                    setIsSubmitting(false);
                    return;
                }
            }

            const response = await fetch(`${apiConfig.endpoint}tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token || '',
                },
                body: JSON.stringify({
                    ...formData,
                    reward: parseFloat(formData.reward),
                    timeLimit: parseInt(formData.timeLimit),
                    createdAt: new Date().toISOString(),
                    mediaUrl: mediaUrl || undefined,
                }),
            });

            if (response.ok) {
                setMessage('¡Tarea publicada exitosamente!');
                setFormData({
                    title: '',
                    description: '',
                    reward: '',
                    category: 'Data Entry',
                    timeLimit: '30',
                    complexity: 'Low',
                    mediaUrl: ''
                });
                setMediaFile(null);
                setMediaPreviewUrl(null);
                setTimeout(() => setMessage(''), 3000);
            } else {
                setMessage('Error al publicar tarea.');
            }
        } catch (error) {
            console.error(error);
            setMessage('Error al publicar tarea.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openReview = (taskId: string, title: string) => {
        setSelectedTaskId(taskId);
        setSelectedTaskTitle(title);
    };

    return (
        <div className="dashboard-container">
            {/* Stats Section */}
            {showStats && (
                <div style={{ marginBottom: '2rem' }}>
                    {/* Quick Stats Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        <MetricsCard
                            title="Tasks Published"
                            value={requesterStats.tasksPublished}
                            icon="📝"
                            color="primary"
                            trend={{ value: 12, isPositive: true }}
                        />
                        <MetricsCard
                            title="Completed"
                            value={requesterStats.tasksCompleted}
                            icon="✅"
                            color="success"
                            subtitle={`${requesterStats.tasksPublished > 0 ? ((requesterStats.tasksCompleted / requesterStats.tasksPublished) * 100).toFixed(0) : 0}% completion`}
                        />
                        <MetricsCard
                            title="Avg Quality"
                            value={`${requesterStats.avgQuality}%`}
                            icon="⭐"
                            color="warning"
                        />
                        <MetricsCard
                            title="Throughput"
                            value={`${requesterStats.throughput}/hr`}
                            icon="⚡"
                            color="secondary"
                            subtitle="Tasks completed per hour"
                        />
                    </div>

                    {/* Detailed Stats Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <BudgetTracker {...requesterStats.budget} />
                        <PerformanceChart data={requesterStats.weeklyData} title="Tasks Completed This Week" color="var(--primary-color)" />
                    </div>

                    {/* Recent Tasks with Export */}
                    <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h4 style={{ margin: 0, color: 'var(--text-color)' }}>📋 Recent Tasks</h4>
                            <ExportButton data={requesterStats.recentTasks} filename="tasks-export" label="Export" />
                        </div>
                        <table style={{ width: '100%', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.5rem 0' }}>Task</th>
                                    <th>Status</th>
                                    <th>Submissions</th>
                                    <th>Approved</th>
                                    <th>Approval Rate</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requesterStats.recentTasks.map(task => (
                                    <tr key={task.taskId} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.75rem 0' }}>{task.title}</td>
                                        <td>
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '999px',
                                                fontSize: '0.75rem',
                                                background: task.status === 'Completed' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                                                color: task.status === 'Completed' ? '#22c55e' : 'var(--primary-color)'
                                            }}>
                                                {task.status}
                                            </span>
                                        </td>
                                        <td>{task.submissions}</td>
                                        <td>{task.approved}</td>
                                        <td style={{ color: '#22c55e' }}>{task.submissions > 0 ? ((task.approved / task.submissions) * 100).toFixed(0) : 0}%</td>
                                        <td>
                                            {
                                                /* Show Review button for tasks that might have submissions */
                                                /* Ideally we check submissions count, but we also check status. */
                                                /* Since we don't have accurate submission count yet, we just show it for all or if status is not available? */
                                                /* Let's show it always for now so the user can check. */
                                                <button
                                                    className="btn-primary"
                                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: '#3b82f6' }}
                                                    onClick={() => openReview(task.taskId, task.title)}
                                                >
                                                    Review
                                                </button>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                    ▼ Show Stats & Analytics
                </button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>

                {/* Left Column: Creation Form */}
                <div className="card">
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem', color: 'var(--primary-color)' }}>
                        Crear Nueva Tarea
                    </h3>

                    {message && <div className="status-message">{message}</div>}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Título de la Tarea</label>
                            <input
                                className="form-input"
                                name="title"
                                type="text"
                                placeholder="ej. Transcribir este clip de audio"
                                value={formData.title}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Descripción e Instrucciones</label>
                            <textarea
                                className="form-textarea"
                                name="description"
                                placeholder="Proporciona instrucciones claras paso a paso para el trabajador..."
                                value={formData.description}
                                onChange={handleChange}
                                required
                                rows={5}
                            />
                        </div>

                        <div className="form-group">
                            <label>Archivo Multimedia</label>
                            <div style={{
                                border: 'var(--glass-border)',
                                borderRadius: '0.5rem',
                                padding: '1rem',
                                background: 'rgba(15, 23, 42, 0.5)',
                            }}>
                                <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                                    <input
                                        type="file"
                                        accept="audio/*,image/*"
                                        onChange={handleFileChange}
                                        style={{ color: 'var(--text-muted)' }}
                                    />
                                    {isUploading && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', marginTop: '0.25rem' }}>
                                            Subiendo archivo... {uploadProgress}%
                                        </div>
                                    )}
                                </div>

                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                                    <label style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>O proporciona una URL directa:</label>
                                    <input
                                        className="form-input"
                                        name="mediaUrl"
                                        type="url"
                                        placeholder="https://example.com/image.jpg"
                                        value={(formData as any).mediaUrl || ''}
                                        onChange={handleChange}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid-layout" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Categoría</label>
                                <select
                                    className="form-input"
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                >
                                    <option value="Data Entry">Entrada de Datos</option>
                                    <option value="Image Analysis">Análisis de Imágenes</option>
                                    <option value="Content Moderation">Moderación de Contenido</option>
                                    <option value="Survey">Encuesta</option>
                                    <option value="Translation">Traducción</option>
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Complejidad</label>
                                <select
                                    className="form-input"
                                    name="complexity"
                                    value={formData.complexity}
                                    onChange={handleChange}
                                >
                                    <option value="Low">Baja</option>
                                    <option value="Medium">Media</option>
                                    <option value="High">Alta</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid-layout" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Recompensa ($)</label>
                                <input
                                    className="form-input"
                                    name="reward"
                                    type="number"
                                    placeholder="0.50"
                                    value={formData.reward}
                                    onChange={handleChange}
                                    required
                                    step="0.01"
                                    min="0.01"
                                />
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    💡 20% platform fee applies
                                </small>
                            </div>

                            <div className="form-group">
                                <label>Límite de Tiempo (mins)</label>
                                <input
                                    className="form-input"
                                    name="timeLimit"
                                    type="number"
                                    value={formData.timeLimit}
                                    onChange={handleChange}
                                    required
                                    min="1"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary"
                            style={{ width: '100%', marginTop: '1rem' }}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Publicando...' : 'Publicar Tarea'}
                        </button>
                    </form>
                </div>

                {/* Right Column: Live Preview */}
                <div style={{ position: 'sticky', top: '2rem' }}>
                    <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Vista Previa en Vivo (Vista del Trabajador)</h4>
                    <div className="task-card" style={{ opacity: formData.title ? 1 : 0.6 }}>
                        <div className="task-header">
                            <div>
                                <span style={{
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: 'var(--secondary-color)',
                                    fontWeight: 600
                                }}>
                                    {formData.category}
                                </span>
                                <h3 style={{ margin: '0.5rem 0', fontSize: '1.25rem' }}>
                                    {formData.title || 'Título de la Tarea'}
                                </h3>
                            </div>
                            <span className="task-reward">
                                ${parseFloat(formData.reward || '0').toFixed(2)}
                            </span>
                        </div>

                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            {formData.description || 'La descripción de la tarea aparecerá aquí...'}
                        </p>

                        {/* Media Preview */}
                        {(mediaPreviewUrl || (formData as any).mediaUrl) && (
                            <div style={{ marginBottom: '1.5rem', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                {mediaFile?.type.startsWith('audio') || (formData as any).mediaUrl?.match(/\.(mp3|wav|ogg)$/i) ? (
                                    <audio controls src={mediaPreviewUrl || (formData as any).mediaUrl} style={{ width: '100%' }} />
                                ) : mediaFile?.type.startsWith('image') || (formData as any).mediaUrl?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                    <img src={mediaPreviewUrl || (formData as any).mediaUrl} alt="Task attachment" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}>
                                        📎 {(formData as any).mediaUrl || mediaFile?.name}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            borderTop: 'var(--glass-border)',
                            paddingTop: '1rem'
                        }}>
                            <span>⏱ {formData.timeLimit} mins</span>
                            <span>⚡ {formData.complexity} Complejidad</span>
                        </div>

                        <button className="btn-primary" style={{ width: '100%', marginTop: '1.5rem', opacity: 0.5, cursor: 'not-allowed' }}>
                            Asignar Tarea
                        </button>
                    </div>

                    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                        <h4 style={{ color: '#818cf8', margin: '0 0 0.5rem 0' }}>💡 Consejo</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                            Añadir archivos multimedia ayuda a los trabajadores a entender mejor la tarea.
                            Asegúrate de que tus instrucciones hagan referencia al archivo adjunto.
                        </p>
                    </div>
                </div>
            </div>

            {selectedTaskId && (
                <SubmissionReviewModal
                    taskId={selectedTaskId}
                    taskTitle={selectedTaskTitle}
                    onClose={() => setSelectedTaskId(null)}
                />
            )}
        </div>
    );
}
