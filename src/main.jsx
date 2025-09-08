// Use the globally available React from the CDN
import App from './App.jsx'
import './styles.css'

// Simple function to check if React is available
function checkReact() {
  if (!window.React) {
    console.error('React is not available!');
    return false;
  }
  if (!window.ReactDOM) {
    console.error('ReactDOM is not available!');
    return false;
  }
  console.log('React version:', React.version);
  console.log('ReactDOM version:', ReactDOM.version);
  return true;
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  if (!checkReact()) return;
  
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('Root element not found');
    return;
  }
  
  try {
    // Use the global ReactDOM
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('App rendered successfully');
  } catch (error) {
    console.error('Error rendering React app:', error);
  }
})
