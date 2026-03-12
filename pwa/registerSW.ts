export async function setupPWA() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('Service Worker registered. Scope:', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
}
