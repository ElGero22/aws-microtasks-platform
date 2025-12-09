import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { RequesterApp } from './pages/RequesterApp';
import { WorkerApp } from './pages/WorkerApp';
import { RequesterDashboard } from './pages/RequesterDashboard';
import { RequesterMyTasks } from './pages/RequesterMyTasks';
import { WorkerDashboard } from './pages/WorkerDashboard';
import { WorkerMyTasks } from './pages/WorkerMyTasks';
import { AdminDashboard } from './pages/AdminDashboard';
import { TaskSubmissions } from './pages/TaskSubmissions';
import { WorkerDemoPreview } from './pages/WorkerDemoPreview';
import { AuthPage } from './pages/AuthPage';
import { RoleSelection } from './pages/RoleSelection';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './styles/dashboard.css';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: any }) {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const location = useLocation();

  if (authStatus !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function Landing() {
  return (
    <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '10vh' }}>
      <h1 style={{
        fontSize: '3.5rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(to right, var(--primary-color), var(--secondary-color))',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        AWS Crowdsourcing Platform
      </h1>
      <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '4rem', maxWidth: '600px', margin: '0 auto 4rem' }}>
        Connect with a global workforce to complete your tasks efficiently, or earn rewards by completing microtasks.
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ width: '300px', padding: '3rem 2rem', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Get Started</h2>
            <p style={{ color: 'var(--text-muted)' }}>Sign in to post tasks or start earning.</p>
            <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}>Login / Sign Up</button>
          </div>
        </Link>
      </div>

      {/* Admin Link */}
      <div style={{ marginTop: '3rem' }}>
        <Link to="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textDecoration: 'none' }}>
          🛡️ Admin Dashboard
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <Authenticator.Provider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage />} />

          <Route path="/select-role" element={
            <ProtectedRoute>
              <RoleSelection />
            </ProtectedRoute>
          } />

          <Route path="/requester" element={
            <ProtectedRoute>
              <RequesterApp />
            </ProtectedRoute>
          }>
            <Route index element={<RequesterDashboard />} />
            <Route path="my-tasks" element={<RequesterMyTasks />} />
          </Route>

          <Route path="/worker" element={
            <ProtectedRoute>
              <WorkerApp />
            </ProtectedRoute>
          }>
            <Route index element={<WorkerDashboard />} />
            <Route path="my-tasks" element={<WorkerMyTasks />} />
          </Route>

          <Route path="/worker/demo" element={<WorkerDemoPreview />} />
          <Route path="/tasks/:taskId/submissions" element={<TaskSubmissions />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
    </Authenticator.Provider>
  );
}

export default App;

