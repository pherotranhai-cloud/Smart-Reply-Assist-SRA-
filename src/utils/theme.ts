
export type ThemeMode = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const getSystemTheme = (): Theme => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const resolveTheme = (mode: ThemeMode): Theme => {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
};

export const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  // Also toggle 'dark' class for tailwind if needed, 
  // though we are moving to data-theme based tokens.
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

export const watchSystemThemeChanges = (onChange: (theme: Theme) => void) => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => {
    onChange(e.matches ? 'dark' : 'light');
  };
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
};
