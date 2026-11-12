import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router';

import App from '@/App';
import { installCodeTheme } from '@/lib/code-themes';
import { getRuntimeEnvironment } from '@/lib/electron-api';
import { installInputModality } from '@/lib/input-modality';
import { applyScrollbarMode } from '@/lib/scrollbar-mode';
import '@/styles.css';

const Router = getRuntimeEnvironment() === 'electron' ? HashRouter : BrowserRouter;

applyScrollbarMode();
installCodeTheme();
installInputModality();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
