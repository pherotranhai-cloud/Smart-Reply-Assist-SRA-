export async function setupPWA() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
}
