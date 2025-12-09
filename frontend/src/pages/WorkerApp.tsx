import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { authConfig, apiConfig } from '../aws-config';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

Amplify.configure(authConfig);

export function WorkerApp() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [userName, setUserName] = useState<string>('');
    const [earnings, setEarnings] = useState<number>(0);
    const [pendingEarnings, setPendingEarnings] = useState<number>(0);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const loadUserData = async () => {
            try {
                // 1. Load Attributes
                const attributes = await fetchUserAttributes();
                setUserName(attributes.name || attributes.preferred_username || user?.username || '');

                // 2. Load Earnings (Fetch My Tasks and sum rewards)
                // Note: In a real app, this should be a dedicated /earnings endpoint for performance
                const session = await fetchAuthSession();
                const token = session.tokens?.idToken?.toString();

                // Using the correctly imported apiConfig
                const response = await fetch(`${apiConfig.endpoint}tasks/my-tasks`, {
                    method: 'GET',
                    headers: {
                        'Authorization': token || '',
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    const tasks = data.tasks || [];

                    // Only count APPROVED or PAID tasks as actual earnings.
                    const total = tasks
                        .filter((t: any) => ['APPROVED', 'PAID'].includes(t.status))
                        .reduce((sum: number, t: any) => sum + ((parseFloat(t.reward) || 0) * 0.8), 0);

                    // Calculate Pending Earnings (Submitted but not yet approved)
                    const pending = tasks
                        .filter((t: any) => ['SUBMITTED', 'PENDING_QC'].includes(t.status))
                        .reduce((sum: number, t: any) => sum + ((parseFloat(t.reward) || 0) * 0.8), 0);

                    setEarnings(total);
                    setPendingEarnings(pending);
                }

            } catch (error) {
                console.error('Error loading user data:', error);
                setUserName(user?.username || '');
            }
        };
        if (user) loadUserData();
    }, [user]);

    return (
        <div style={{ width: '100%' }}>
            <div className="header" style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)' }}>
                <h2>Panel de Trabajador</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            padding: '0.5rem 1rem',
                            borderRadius: '2rem',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <span>💰</span>
                            <span>${earnings.toFixed(2)}</span>
                        </div>
                        {pendingEarnings > 0 && (
                            <div style={{ fontSize: '0.8rem', color: '#fbbf24', marginTop: '4px', marginRight: '10px' }}>
                                <span>⏳ ${pendingEarnings.toFixed(2)} Pendiente</span>
                            </div>
                        )}
                    </div>
                    <Link to="/requester" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>Cambiar a Requester</Link>
                    <span style={{ color: 'var(--text-muted)' }}>Hola, {userName || user?.username}</span>
                    <button className="btn-secondary" onClick={signOut}>Cerrar sesión</button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)', display: 'flex', gap: '1rem' }}>
                <button
                    onClick={() => navigate('/worker')}
                    className={location.pathname === '/worker' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.5rem 1.5rem' }}
                >
                    Tareas Disponibles
                </button>
                <button
                    onClick={() => navigate('/worker/my-tasks')}
                    className={location.pathname === '/worker/my-tasks' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.5rem 1.5rem' }}
                >
                    Mis Tareas
                </button>
            </div>

            <Outlet />
        </div>
    );
}
