import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Make sure React is available globally for debugging
window.React = React;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('Root element not found');
    return;
  }
  
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Error rendering React app:', error);
  }
})
