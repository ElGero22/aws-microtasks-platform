import { useNavigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiConfig } from '../aws-config';

export function RoleSelection() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const navigate = useNavigate();

    const handleSelectRole = async (role: 'requester' | 'worker') => {
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            if (token) {
                await fetch(`${apiConfig.endpoint}auth/role`, {
                    method: 'POST',
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ role })
                });
            }
        } catch (error) {
            console.error('Error assigning role:', error);
        }
        navigate(`/${role}`);
    };

    return (
        <div className="dashboard-container" style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 0
        }}>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '2.5rem' }}>Select Your Role</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.2rem' }}>
                Hello, {user?.username}. How would you like to continue?
            </p>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Requester Card */}
                <div
                    className="card"
                    onClick={() => handleSelectRole('requester')}
                    style={{
                        width: '320px',
                        padding: '3rem 2rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        border: '1px solid rgba(99, 102, 241, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-5px)';
                        e.currentTarget.style.borderColor = 'var(--primary-color)';
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.2)';
                        e.currentTarget.style.background = 'var(--card-bg)';
                    }}
                >
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>💼</div>
                    <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Requester</h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        I want to post tasks, manage projects, and get work done.
                    </p>
                    <button className="btn-primary" style={{ marginTop: '2rem', width: '100%' }}>
                        Enter as Requester
                    </button>
                </div>

                {/* Worker Card */}
                <div
                    className="card"
                    onClick={() => handleSelectRole('worker')}
                    style={{
                        width: '320px',
                        padding: '3rem 2rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        border: '1px solid rgba(139, 92, 246, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-5px)';
                        e.currentTarget.style.borderColor = 'var(--secondary-color)';
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                        e.currentTarget.style.background = 'var(--card-bg)';
                    }}
                >
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⚒️</div>
                    <h2 style={{ color: 'var(--secondary-color)', marginBottom: '1rem' }}>Worker</h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        I want to browse available tasks, complete work, and earn money.
                    </p>
                    <button className="btn-primary" style={{ marginTop: '2rem', width: '100%', background: 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' }}>
                        Enter as Worker
                    </button>
                </div>
            </div>

            <button
                onClick={signOut}
                style={{
                    marginTop: '3rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                }}
            >
                Sign out
            </button>
        </div>
    );
}
