import { useState } from 'react';
import { UserPreferences, BackgroundEffect } from '../types';
import { INITIAL_WALLPAPER } from '../constants/wallpapers';

const STORAGE_KEY = 'app_user_preferences';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  backgroundImage: INITIAL_WALLPAPER,
  savedWallpapers: [],
  backgroundEffect: 'none',
  fontSize: 'base',
  fontFamily: 'sans'
};

export const useUserPreferences = () => {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to parse user preferences from localStorage', e);
    }
    return DEFAULT_PREFERENCES;
  });

  const savePreferences = (newPrefs: UserPreferences) => {
    setPreferencesState(newPrefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
  };

  const setBgImage = (url: string) => {
    savePreferences({ ...preferences, backgroundImage: url });
  };

  const saveWallpaper = (url: string) => {
    const savedWallpapers = preferences.savedWallpapers || [];
    if (!savedWallpapers.includes(url)) {
      savePreferences({ ...preferences, savedWallpapers: [...savedWallpapers, url] });
    }
  };

  const removeSavedWallpaper = (url: string) => {
    const savedWallpapers = preferences.savedWallpapers || [];
    savePreferences({
      ...preferences,
      savedWallpapers: savedWallpapers.filter((w) => w !== url)
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
    setEffect,
    setPreferences: savePreferences
  };
};
