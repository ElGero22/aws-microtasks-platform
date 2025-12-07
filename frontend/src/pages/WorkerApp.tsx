import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { authConfig, apiConfig } from '../aws-config';
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
            order: 2,
            placeholder: 'Enter your email'
        },
        password: {
            order: 3,
            placeholder: 'Enter password'
        },
        confirm_password: {
            order: 4,
            placeholder: 'Confirm password'
        }
    },
};

const AuthenticatedWorkerView = () => {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [userName, setUserName] = useState<string>('');
    const [earnings, setEarnings] = useState<number>(0);
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

                    const total = tasks
                        .filter((t: any) => ['SUBMITTED', 'COMPLETED', 'PAID'].includes(t.status))
                        .reduce((sum: number, t: any) => sum + (parseFloat(t.reward) || 0), 0);

                    setEarnings(total);
                }

            } catch (error) {
                console.error('Error loading user data:', error);
                setUserName(user?.username || '');
            }
        };
        loadUserData();
    }, [user]);

    return (
        <div style={{ width: '100%' }}>
            <div className="header" style={{ padding: '1rem 2rem', borderBottom: 'var(--glass-border)' }}>
                <h2>Panel de Trabajador</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                <Authenticator
                    formFields={formFields}
                    signUpAttributes={['name']}
                    loginMechanisms={['email']}
                />
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
