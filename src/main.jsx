import React from 'react';
import { createRoot } from 'react-dom/client';
import AuthGate from './components/AuthGate';
import App from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
