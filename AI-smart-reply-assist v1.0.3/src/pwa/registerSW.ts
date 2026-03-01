import { RUNTIME } from '../runtime/env';

export async function setupPWA() {
  if (RUNTIME === 'pwa') {
    try {
      // @ts-ignore
      const { registerSW } = await import('virtual:pwa-register');
      const updateSW = registerSW({
        onNeedRefresh() {
          if (confirm('New content available. Reload?')) {
            updateSW(true);
          }
        },
        onOfflineReady() {
          console.log('PWA Offline Ready');
        },
      });
    } catch (e) {
      console.warn('PWA registration failed or virtual module missing', e);
    }
  }
}
