import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { authConfig } from '../aws-config';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const formFields = {
    signUp: {
        name: {
            order: 1,
            label: 'Full Name',
            placeholder: 'Enter your full name',
            isRequired: true,
        },
        email: {
            order: 2
        },
        password: {
            order: 3
        },
        confirm_password: {
            order: 4
        }
    },
};

const AuthenticatedWorkerView = () => {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [userName, setUserName] = useState<string>('');
    const location = useLocation();
    const navigate = useNavigate();

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
        loadUserName();
    }, [user]);

    return (
        <div style={{ width: '100%' }}>
            <div className="header" style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)' }}>
                <h2>Panel de Trabajador</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link to="/requester" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>Cambiar a Solicitante</Link>
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
};

const WorkerAppContent = () => {
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    if (authStatus === 'authenticated') {
        return <AuthenticatedWorkerView />;
    }

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{
                        fontSize: '2.5rem',
                        marginBottom: '0.5rem',
                        background: 'linear-gradient(to right, var(--primary-color), var(--secondary-color))',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        Worker Portal
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Sign in to browse and complete tasks</p>
                </div>
                <Authenticator formFields={formFields} />
            </div>
        </div>
    );
};

Amplify.configure(authConfig);

export function WorkerApp() {
    return (
        <Authenticator.Provider>
            <WorkerAppContent />
        </Authenticator.Provider>
    );
}
