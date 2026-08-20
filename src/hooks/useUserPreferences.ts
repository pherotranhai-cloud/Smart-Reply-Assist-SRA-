import { useState } from 'react';
import { UserPreferences, BackgroundEffect, SavedWallpaper } from '../types';
import { INITIAL_WALLPAPER } from '../constants/wallpapers';
import { STORAGE_KEYS } from '../constants/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.USER_PREFERENCES;

/** Key written by the old Settings → Theme Mode control, removed in v2.13. */
const LEGACY_THEME_KEY = 'sra_theme';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  backgroundImage: INITIAL_WALLPAPER,
  savedWallpapers: [],
  backgroundEffect: 'none',
  fontSize: 'base',
  fontFamily: 'sans'
};

/**
 * Saved wallpapers used to be a bare string[]. They now carry a label, so
 * older entries are given one based on their position.
 */
function normaliseSavedWallpapers(raw: unknown): SavedWallpaper[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, i): SavedWallpaper | null => {
      if (typeof entry === 'string') return { url: entry, name: `Ảnh ${i + 1}` };
      if (entry && typeof entry === 'object' && typeof (entry as any).url === 'string') {
        const e = entry as any;
        return { url: e.url, name: typeof e.name === 'string' && e.name.trim() ? e.name : `Ảnh ${i + 1}` };
      }
      return null;
    })
    .filter((w): w is SavedWallpaper => w !== null);
}

/**
 * Theme Mode and Personalization → UI Theme used to be separate controls
 * writing the same attribute. They are now one. A user whose only stored
 * choice was the old control keeps it; anyone who had picked a palette
 * already has `theme` in their stored preferences and is left alone.
 */
function migrateLegacyTheme(stored: Record<string, unknown>): UserPreferences['theme'] | undefined {
  if (stored.theme) return undefined;
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (!legacy) return undefined;
    const parsed = JSON.parse(legacy);
    if (parsed === 'light' || parsed === 'dark' || parsed === 'system') return parsed;
  } catch {
    /* unreadable legacy value — fall through to the default */
  }
  return undefined;
}

function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const migratedTheme = migrateLegacyTheme(stored);
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      ...(migratedTheme ? { theme: migratedTheme } : {}),
      savedWallpapers: normaliseSavedWallpapers(stored.savedWallpapers),
    } as UserPreferences;
  } catch (e) {
    console.error('Failed to parse user preferences from localStorage', e);
    return DEFAULT_PREFERENCES;
  }
}

export const useUserPreferences = () => {
  const [preferences, setPreferencesState] = useState<UserPreferences>(loadPreferences);

  const savePreferences = (newPrefs: UserPreferences) => {
    setPreferencesState(newPrefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
      // The legacy key is dead once preferences own the theme.
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch (e) {
      // Saved wallpapers are stored inline, so the quota is the realistic limit.
      console.error('Failed to save user preferences — storage may be full', e);
      throw e;
    }
  };

  const setBgImage = (url: string) => {
    savePreferences({ ...preferences, backgroundImage: url });
  };

  const saveWallpaper = (wallpaper: SavedWallpaper) => {
    const saved = preferences.savedWallpapers || [];
    if (saved.some(w => w.url === wallpaper.url)) return;
    savePreferences({ ...preferences, savedWallpapers: [...saved, wallpaper] });
  };

  const removeSavedWallpaper = (url: string) => {
    const saved = preferences.savedWallpapers || [];
    savePreferences({
      ...preferences,
      savedWallpapers: saved.filter(w => w.url !== url),
      backgroundImage: preferences.backgroundImage === url ? '' : preferences.backgroundImage,
    });
  };

  const renameSavedWallpaper = (url: string, name: string) => {
    const saved = preferences.savedWallpapers || [];
    savePreferences({
      ...preferences,
      savedWallpapers: saved.map(w => (w.url === url ? { ...w, name } : w)),
    });
  };

  const setEffect = (effect: BackgroundEffect) => {
    savePreferences({ ...preferences, backgroundEffect: effect });
  };

  return {
    preferences,
    setBgImage,
    saveWallpaper,
    removeSavedWallpaper,
    renameSavedWallpaper,
    setEffect,
    setPreferences: savePreferences
  };
};
