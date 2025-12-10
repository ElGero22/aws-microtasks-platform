
import '../styles/dashboard.css';

interface MetricsCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
}

export function MetricsCard({ title, value, subtitle, icon, trend, color = 'primary' }: MetricsCardProps) {
    const colorMap = {
        primary: 'var(--primary-color)',
        secondary: 'var(--secondary-color)',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444'
    };

    return (
        <div className="card" style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: `1px solid ${colorMap[color]}25`,
            padding: '1.5rem',
            borderRadius: '1rem',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background glow */}
            <div style={{
                position: 'absolute',
                top: '-50%',
                right: '-50%',
                width: '100%',
                height: '100%',
                background: `radial-gradient(circle, ${colorMap[color]}15 0%, transparent 70%)`,
                pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{title}</span>
                <span style={{ fontSize: '1.5rem' }}>{icon}</span>
            </div>

            <div style={{ fontSize: '2rem', fontWeight: 700, color: colorMap[color], marginBottom: '0.25rem' }}>
                {value}
            </div>

            {subtitle && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subtitle}</div>
            )}

            {trend && (
                <div style={{
                    marginTop: '0.75rem',
                    fontSize: '0.8rem',
                    color: trend.isPositive ? '#22c55e' : '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                }}>
                    <span>{trend.isPositive ? '↑' : '↓'}</span>
                    <span>{Math.abs(trend.value)}% vs last week</span>
                </div>
            )}
        </div>
    );
}

interface BudgetTrackerProps {
    totalBudget: number;
    spent: number;
    pending: number;
}

export function BudgetTracker({ totalBudget, spent, pending }: BudgetTrackerProps) {
    const available = totalBudget - spent - pending;
    const spentPercent = (spent / totalBudget) * 100;
    const pendingPercent = (pending / totalBudget) * 100;

    return (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-color)', fontSize: '1.1rem' }}>
                💰 Seguimiento de Presupuesto
            </h4>

            {/* Progress bar */}
            <div style={{
                height: '12px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '1rem'
            }}>
                <div style={{
                    display: 'flex',
                    height: '100%'
                }}>
                    <div style={{
                        width: `${spentPercent}%`,
                        background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                        transition: 'width 0.3s ease'
                    }} />
                    <div style={{
                        width: `${pendingPercent}%`,
                        background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                        transition: 'width 0.3s ease'
                    }} />
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Gastado</div>
                    <div style={{ color: '#22c55e', fontWeight: 600 }}>${spent.toFixed(2)}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Pendiente</div>
                    <div style={{ color: '#f59e0b', fontWeight: 600 }}>${pending.toFixed(2)}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Disponible</div>
                    <div style={{ color: 'var(--primary-color)', fontWeight: 600 }}>${available.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}

interface EarningsBreakdownProps {
    today: number;
    week: number;
    month: number;
    total: number;
}

export function EarningsBreakdown({ today, week, month, total }: EarningsBreakdownProps) {
    return (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-color)', fontSize: '1.1rem' }}>
                📊 Desglose de Ganancias
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{
                    padding: '1rem',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>HOY</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>${today.toFixed(2)}</div>
                </div>

                <div style={{
                    padding: '1rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(99, 102, 241, 0.2)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>ESTA SEMANA</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>${week.toFixed(2)}</div>
                </div>

                <div style={{
                    padding: '1rem',
                    background: 'rgba(244, 114, 182, 0.1)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(244, 114, 182, 0.2)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>ESTE MES</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f472b6' }}>${month.toFixed(2)}</div>
                </div>

                <div style={{
                    padding: '1rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TOTAL HISTÓRICO</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-color)' }}>${total.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}

interface LeaderboardEntry {
    rank: number;
    name: string;
    earnings: number;
    tasksCompleted: number;
    accuracy: number;
    isCurrentUser?: boolean;
}

interface LeaderboardProps {
    entries: LeaderboardEntry[];
}

export function Leaderboard({ entries }: LeaderboardProps) {
    const getRankEmoji = (rank: number) => {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `#${rank}`;
        }
    };

    return (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-color)', fontSize: '1.1rem' }}>
                🏆 Top Trabajadores (Semanal)
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {entries.map((entry) => (
                    <div
                        key={entry.rank}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '50px 1fr 80px 80px',
                            alignItems: 'center',
                            padding: '0.75rem 1rem',
                            background: entry.isCurrentUser ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)',
                            borderRadius: '0.5rem',
                            border: entry.isCurrentUser ? '1px solid var(--primary-color)' : '1px solid transparent',
                            fontSize: '0.9rem'
                        }}
                    >
                        <span style={{ fontWeight: 600, fontSize: entry.rank <= 3 ? '1.25rem' : '1rem' }}>
                            {getRankEmoji(entry.rank)}
                        </span>
                        <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-color)' }}>
                                {entry.name}
                                {entry.isCurrentUser && <span style={{ color: 'var(--primary-color)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>(Tú)</span>}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {entry.tasksCompleted} tareas • {entry.accuracy}% precisión
                            </div>
                        </div>
                        <span style={{ color: '#22c55e', fontWeight: 600, textAlign: 'right' }}>
                            ${entry.earnings.toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface PerformanceChartProps {
    data: { date: string; value: number }[];
    title: string;
    color?: string;
}

export function PerformanceChart({ data, title, color = 'var(--primary-color)' }: PerformanceChartProps) {
    const maxValue = Math.max(...data.map(d => d.value));

    return (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-color)', fontSize: '1.1rem' }}>
                📈 {title}
            </h4>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px' }}>
                {data.map((item, index) => (
                    <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div
                            style={{
                                width: '100%',
                                height: `${(item.value / maxValue) * 100}px`,
                                background: `linear-gradient(180deg, ${color}, ${color}55)`,
                                borderRadius: '4px 4px 0 0',
                                minHeight: '4px',
                                transition: 'height 0.3s ease'
                            }}
                            title={`${item.date}: ${item.value}`}
                        />
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {item.date}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface ExportButtonProps {
    data: any[];
    filename: string;
    label?: string;
}

export function ExportButton({ data, filename, label = 'Export' }: ExportButtonProps) {
    const handleExportCSV = () => {
        if (data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
    };

    const handleExportJSON = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.json`;
        link.click();
    };

    return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
                className="btn-secondary"
                onClick={handleExportCSV}
                style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
            >
                📥 {label} CSV
            </button>
            <button
                className="btn-secondary"
                onClick={handleExportJSON}
                style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
            >
                📥 {label} JSON
            </button>
        </div>
    );
}
