import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// The service worker is registered by vite-plugin-pwa (vite.config.ts). This
// removes the cache the retired hand-written worker left on existing installs.
if (typeof caches !== 'undefined') {
  caches.delete('smart-reply-cache-v1').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
