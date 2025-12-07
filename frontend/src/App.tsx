import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { RequesterApp } from './pages/RequesterApp';
import { WorkerApp } from './pages/WorkerApp';
import { RequesterDashboard } from './pages/RequesterDashboard';
import { RequesterMyTasks } from './pages/RequesterMyTasks';
import { WorkerDashboard } from './pages/WorkerDashboard';
import { WorkerMyTasks } from './pages/WorkerMyTasks';
import '@aws-amplify/ui-react/styles.css';
import './styles/dashboard.css';

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
        <Link to="/requester" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ width: '300px', padding: '3rem 2rem', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <h2 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>I am a Requester</h2>
            <p style={{ color: 'var(--text-muted)' }}>Post tasks and manage your projects.</p>
            <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}>Get Started</button>
          </div>
        </Link>

        <Link to="/worker" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ width: '300px', padding: '3rem 2rem', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <h2 style={{ color: 'var(--secondary-color)', marginBottom: '1rem' }}>I am a Worker</h2>
            <p style={{ color: 'var(--text-muted)' }}>Browse tasks and earn rewards.</p>
            <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%', background: 'linear-gradient(135deg, var(--secondary-color), var(--primary-color))' }}>Start Earning</button>
          </div>
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/requester" element={<RequesterApp />}>
          <Route index element={<RequesterDashboard />} />
          <Route path="my-tasks" element={<RequesterMyTasks />} />
        </Route>
        <Route path="/worker" element={<WorkerApp />}>
          <Route index element={<WorkerDashboard />} />
          <Route path="my-tasks" element={<WorkerMyTasks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
