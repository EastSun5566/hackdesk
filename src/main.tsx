import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';

import App from '@/App';
import { getRuntimeEnvironment } from '@/lib/electron-api';
import '@/styles.css';

const Router = getRuntimeEnvironment() === 'electron' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
