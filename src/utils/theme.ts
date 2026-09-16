
import { UiTheme } from '../types';

type Theme = 'dark' | 'light';

const getSystemTheme = (): Theme => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Turns the stored UI theme into the value written to data-theme.
 * 'system' follows the OS; the named palettes pass through unchanged.
 */
export const resolveUiTheme = (theme: UiTheme | undefined): string => {
  if (!theme || theme === 'system') return getSystemTheme();
  return theme;
};

/** True for palettes that need Tailwind's `dark` class alongside data-theme. */
export const isDarkPalette = (resolved: string): boolean =>
  resolved === 'dark' || resolved === 'cyberpunk' || resolved === 'industrial';

export const watchSystemThemeChanges = (onChange: (theme: Theme) => void) => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => {
    onChange(e.matches ? 'dark' : 'light');
  };
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
};
