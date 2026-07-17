export const windowAdapter = {
  openAppWindow() {
    // In PWA mode, we don't need to send messages to background
  },
  
  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
};
