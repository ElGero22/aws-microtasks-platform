import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { authConfig } from '../aws-config';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

export function RequesterApp() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [userName, setUserName] = useState<string>('');
    const location = useLocation();
    const navigate = useNavigate();
    const [isConfigured, setIsConfigured] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            try {
                Amplify.configure(authConfig);
                setIsConfigured(true);
            } catch (error) {
                console.error('Error configuring Amplify:', error);
            }
        };

        initAuth();
    }, []);

    useEffect(() => {
        const loadUserName = async () => {
            try {
                const attributes = await fetchUserAttributes();
                setUserName(attributes.name || attributes.preferred_username || user?.username || '');
            } catch (error) {
                console.error('Error fetching user attributes:', error);
                setUserName(user?.username || '');
            }
        };
        if (user) loadUserName();
    }, [user]);

    if (!isConfigured) return <div>Loading...</div>;

    return (
        <div style={{ width: '100%' }}>
            <div className="header" style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)' }}>
                <h2>Panel de Solicitante</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link to="/worker" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>Cambiar a Worker</Link>
                    <span style={{ color: 'var(--text-muted)' }}>Hola, {userName || user?.username}</span>
                    <button className="btn-secondary" onClick={signOut}>Cerrar sesión</button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)', display: 'flex', gap: '1rem' }}>
                <button
                    onClick={() => navigate('/requester')}
                    className={location.pathname === '/requester' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.5rem 1.5rem' }}
                >
                    Crear Tarea
                </button>
                <button
                    onClick={() => navigate('/requester/my-tasks')}
                    className={location.pathname === '/requester/my-tasks' ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '0.5rem 1.5rem' }}
                >
                    Mis Tareas Publicadas
                </button>
            </div>

            <Outlet />
        </div>
    );
}
