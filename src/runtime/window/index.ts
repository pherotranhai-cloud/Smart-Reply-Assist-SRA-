import { IS_EXTENSION } from '../env';

export const windowAdapter = {
  openAppWindow() {
    if (IS_EXTENSION && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // This is usually handled by background.js on icon click, 
      // but if we want to trigger it from UI:
      chrome.runtime.sendMessage({ type: 'OPEN_WINDOW' });
    }
  },
  
  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || (typeof chrome !== 'undefined' && !!chrome.windows);
  }
};
