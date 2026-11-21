import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ProxiSpeak] App crashed:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '32px 16px', background: '#f3f5fa', fontFamily: 'Inter, sans-serif',
          gap: '16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <strong style={{ fontSize: '1.2rem', color: '#1b2337' }}>Something went wrong</strong>
          <p style={{ color: '#64708a', maxWidth: 400, margin: 0 }}>
            ProxiSpeak encountered an unexpected error. Please refresh the page to try again.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              padding: '10px 24px', background: '#5146d8', color: '#fff',
              border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Reload ProxiSpeak
          </button>
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <pre style={{
              background: '#fff', border: '1px solid #e5e9f1', borderRadius: '8px',
              padding: '12px', fontSize: '0.75rem', color: '#ef4444', maxWidth: '600px',
              overflow: 'auto', textAlign: 'left', maxHeight: '200px',
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
