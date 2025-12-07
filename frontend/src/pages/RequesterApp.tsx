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

const AuthenticatedRequesterView = () => {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [userName, setUserName] = useState<string>('');

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

    const location = useLocation();
    const navigate = useNavigate();

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
};

const RequesterAppContent = () => {
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    if (authStatus === 'authenticated') {
        return <AuthenticatedRequesterView />;
    }

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <Authenticator formFields={formFields} loginMechanisms={['email']} />
            </div>
        </div>
    );
};

export function RequesterApp() {
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

    if (!isConfigured) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                backgroundColor: 'var(--bg-color)',
                color: 'var(--text-color)'
            }}>
                Cargando...
            </div>
        );
    }

    return (
        <Authenticator.Provider>
            <RequesterAppContent />
        </Authenticator.Provider>
    );
}
