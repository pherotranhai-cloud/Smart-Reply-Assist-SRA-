export const RUNTIME = (import.meta.env.VITE_RUNTIME as 'extension' | 'pwa') ?? 'pwa';
export const IS_EXTENSION = RUNTIME === 'extension';
export const IS_PWA = RUNTIME === 'pwa';
