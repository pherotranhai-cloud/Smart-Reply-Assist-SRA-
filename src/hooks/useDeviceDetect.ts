import { useSyncExternalStore } from 'react';

const DESKTOP_MIN_WIDTH = 1024;
const QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

/**
 * One MediaQueryList for the whole app.
 *
 * Seven components call this hook independently — the six tab dispatchers plus
 * Layout — and each used to register its own `resize` listener, so a window
 * drag woke seven callbacks and seven setState calls. Subscribing them all to a
 * single matchMedia leaves one listener regardless of how many callers there
 * are, and the browser only fires it when the breakpoint is actually crossed
 * rather than on every resize frame.
 */
const query = typeof window === 'undefined' ? null : window.matchMedia(QUERY);

const subscribe = (onChange: () => void) => {
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

// Resolved during the first render: initialising to `false` made every mount
// paint the mobile layout for one frame before flipping to desktop.
const getSnapshot = () => (query ? query.matches : false);

// SSR / prerender has no viewport to measure; mobile-first is the safer guess.
const getServerSnapshot = () => false;

export const useDeviceDetect = () => {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isDesktop };
};
