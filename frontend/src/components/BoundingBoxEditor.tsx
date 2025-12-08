import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Bounding box coordinates (normalized 0-1 range)
 */
export interface BoundingBox {
    x: number;      // Top-left X coordinate
    y: number;      // Top-left Y coordinate
    w: number;      // Width
    h: number;      // Height
}

interface BoundingBoxEditorProps {
    imageUrl: string;
    boxes: BoundingBox[];
    onChange: (boxes: BoundingBox[]) => void;
    disabled?: boolean;
    maxBoxes?: number;
}

/**
 * BoundingBoxEditor - Canvas-based image annotation component
 * Allows users to draw rectangles on images and returns normalized coordinates.
 */
export function BoundingBoxEditor({
    imageUrl,
    boxes,
    onChange,
    disabled = false,
    maxBoxes = 10
}: BoundingBoxEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Load image and get natural dimensions
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            setImageLoaded(true);
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // Draw boxes on canvas
    const drawBoxes = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !imageLoaded) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match canvas size to container
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw existing boxes
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';

        boxes.forEach((box, index) => {
            const x = box.x * canvas.width;
            const y = box.y * canvas.height;
            const w = box.w * canvas.width;
            const h = box.h * canvas.height;

            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);

            // Draw box number
            ctx.fillStyle = '#6366f1';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(`#${index + 1}`, x + 4, y + 16);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
        });

        // Draw current box being drawn
        if (currentBox) {
            ctx.strokeStyle = '#10b981';
            ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            const x = currentBox.x * canvas.width;
            const y = currentBox.y * canvas.height;
            const w = currentBox.w * canvas.width;
            const h = currentBox.h * canvas.height;

            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
    }, [boxes, currentBox, imageLoaded]);

    // Redraw when boxes change
    useEffect(() => {
        drawBoxes();
    }, [drawBoxes]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => drawBoxes();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawBoxes]);

    const getRelativePosition = (e: React.MouseEvent): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (disabled || boxes.length >= maxBoxes) return;

        const pos = getRelativePosition(e);
        if (!pos) return;

        setIsDrawing(true);
        setStartPoint(pos);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !startPoint) return;

        const pos = getRelativePosition(e);
        if (!pos) return;

        // Calculate box from start to current position
        const x = Math.min(startPoint.x, pos.x);
        const y = Math.min(startPoint.y, pos.y);
        const w = Math.abs(pos.x - startPoint.x);
        const h = Math.abs(pos.y - startPoint.y);

        setCurrentBox({ x, y, w, h });
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentBox) {
            setIsDrawing(false);
            setStartPoint(null);
            setCurrentBox(null);
            return;
        }

        // Only add box if it has meaningful size (> 1% of image)
        if (currentBox.w > 0.01 && currentBox.h > 0.01) {
            onChange([...boxes, currentBox]);
        }

        setIsDrawing(false);
        setStartPoint(null);
        setCurrentBox(null);
    };

    const handleClearAll = () => {
        onChange([]);
    };

    const handleRemoveLast = () => {
        if (boxes.length > 0) {
            onChange(boxes.slice(0, -1));
        }
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            {/* Canvas Container */}
            <div
                ref={containerRef}
                style={{
                    position: 'relative',
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '2px solid rgba(99, 102, 241, 0.3)',
                    cursor: disabled ? 'default' : 'crosshair',
                    background: 'rgba(10, 14, 26, 0.5)'
                }}
            >
                {/* Background Image */}
                <img
                    src={imageUrl}
                    alt="Imagen para anotar"
                    style={{
                        width: '100%',
                        maxHeight: '400px',
                        objectFit: 'contain',
                        display: 'block',
                        opacity: disabled ? 0.5 : 1
                    }}
                    draggable={false}
                />

                {/* Canvas Overlay */}
                <canvas
                    ref={canvasRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: disabled ? 'none' : 'auto'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />

                {/* Instructions Overlay */}
                {!disabled && boxes.length === 0 && !isDrawing && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '1rem 2rem',
                        borderRadius: '0.5rem',
                        textAlign: 'center',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🖊️</div>
                        <div>Haz clic y arrastra para dibujar un rectángulo</div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.75rem',
                gap: '0.5rem'
            }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {boxes.length} / {maxBoxes} rectángulos
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        type="button"
                        onClick={handleRemoveLast}
                        disabled={disabled || boxes.length === 0}
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            cursor: disabled || boxes.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: disabled || boxes.length === 0 ? 0.5 : 1,
                            fontSize: '0.875rem'
                        }}
                    >
                        ↩️ Deshacer
                    </button>
                    <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={disabled || boxes.length === 0}
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(239, 68, 68, 0.2)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '0.5rem',
                            color: '#f87171',
                            cursor: disabled || boxes.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: disabled || boxes.length === 0 ? 0.5 : 1,
                            fontSize: '0.875rem'
                        }}
                    >
                        🗑️ Limpiar Todo
                    </button>
                </div>
            </div>

            {/* Box Coordinates Display */}
            {boxes.length > 0 && (
                <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: 'var(--text-muted)'
                }}>
                    <strong style={{ color: 'var(--text-color)' }}>Coordenadas:</strong>
                    <div style={{ marginTop: '0.25rem', maxHeight: '100px', overflow: 'auto' }}>
                        {boxes.map((box, i) => (
                            <div key={i}>
                                #{i + 1}: x={box.x.toFixed(3)}, y={box.y.toFixed(3)}, w={box.w.toFixed(3)}, h={box.h.toFixed(3)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
