import { useState } from 'react';
import { createPortal } from 'react-dom';

interface TaskMediaProps {
    mediaUrl: string | null;
}

export function TaskMedia({ mediaUrl }: TaskMediaProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!mediaUrl) return null;

    const isImage = mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isAudio = mediaUrl.match(/\.(mp3|wav|ogg|m4a)$/i);
    const isVideo = mediaUrl.match(/\.(mp4|webm|mov)$/i);

    return (
        <>
            <div style={{
                marginBottom: '1.5rem',
                borderRadius: '1rem',
                overflow: 'hidden',
                border: 'var(--glass-border)',
                position: 'relative', // Ensure new stacking context
                zIndex: 10 // Lift above card overlays
            }}>
                {isImage ? (
                    <div
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent card click
                            setIsModalOpen(true);
                        }}
                        style={{ cursor: 'pointer', position: 'relative' }}
                    >
                        <img
                            src={mediaUrl}
                            alt="Contenido de la tarea"
                            style={{ width: '100%', maxHeight: '250px', objectFit: 'cover', transition: 'opacity 0.2s' }}
                            onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                        />
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background: 'rgba(0,0,0,0.7)',
                            color: 'white',
                            padding: '0.5rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.75rem',
                            zIndex: 10,
                            pointerEvents: 'none' // Let clicks pass to the container
                        }}>
                            🔍 Click para ampliar
                        </div>
                    </div>
                ) : isAudio ? (
                    <div style={{ padding: '1rem', background: 'rgba(10, 14, 26, 0.5)' }} onClick={(e) => e.stopPropagation()}>
                        <audio controls src={mediaUrl} style={{ width: '100%' }} />
                    </div>
                ) : isVideo ? (
                    <div style={{ padding: '1rem', background: 'rgba(10, 14, 26, 0.5)' }} onClick={(e) => e.stopPropagation()}>
                        <video controls src={mediaUrl} style={{ width: '100%', maxHeight: '300px' }} />
                    </div>
                ) : (
                    <div style={{ padding: '1rem', background: 'rgba(10, 14, 26, 0.5)', textAlign: 'center' }}>
                        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            📎 Ver Archivo Adjunto
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(Se abre en nueva pestaña)</span>
                        </a>
                    </div>
                )}
            </div>

            {/* Image Modal using Portal */}
            {isModalOpen && isImage && createPortal(
                <div
                    onClick={() => setIsModalOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999, // Extremely high z-index
                        cursor: 'pointer',
                        padding: '2rem',
                        backdropFilter: 'blur(5px)'
                    }}
                >
                    <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsModalOpen(false);
                            }}
                            style={{
                                position: 'absolute',
                                top: '-40px',
                                right: '0',
                                background: 'var(--primary-color)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                padding: '0.5rem 1rem',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                zIndex: 10001
                            }}
                        >
                            ✕ Cerrar
                        </button>
                        <img
                            src={mediaUrl}
                            alt="Vista ampliada"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '90vh',
                                objectFit: 'contain',
                                borderRadius: '1rem',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                            }}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
