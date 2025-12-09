import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

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
            placeholder: 'Enter your email',
            isRequired: true,
        },
        password: {
            order: 3,
            placeholder: 'Enter password',
            isRequired: true,
        },
        confirm_password: {
            order: 4,
            placeholder: 'Confirm password',
            isRequired: true,
        }
    },
};

export function AuthPage() {
    const { authStatus } = useAuthenticator((context) => [context.authStatus]);
    const navigate = useNavigate();
    const location = useLocation();

    // Redirect if already authenticated
    useEffect(() => {
        if (authStatus === 'authenticated') {
            const from = location.state?.from?.pathname || '/select-role';
            navigate(from, { replace: true });
        }
    }, [authStatus, navigate, location]);

    return (
        <div className="auth-wrapper" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: 'var(--bg-color)',
            backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 20%)'
        }}>
            <div className="auth-container" style={{
                width: '100%',
                maxWidth: '480px',
                padding: '2rem'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{
                        fontSize: '2.5rem',
                        marginBottom: '0.5rem',
                        background: 'linear-gradient(to right, var(--primary-color), var(--secondary-color))',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontWeight: 800
                    }}>
                        Welcome Back
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                        Sign in or create an account to continue
                    </p>
                </div>

                <div className="amplify-auth-container" style={{
                    background: 'rgba(30, 41, 59, 0.7)',
                    backdropFilter: 'blur(12px)',
                    padding: '1rem',
                    borderRadius: '1.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}>
                    <Authenticator
                        formFields={formFields}
                        loginMechanisms={['email']}
                        signUpAttributes={['name']}
                    />
                </div>
            </div>
        </div>
    );
}
