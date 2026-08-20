export const INITIAL_WALLPAPER = 'https://i.pinimg.com/736x/84/e8/ac/84e8ac330f58a03f5f1328be943c118e.jpg';

/**
 * Shoe-model wallpapers. `name` is a proper noun — "Samba OG" is the same in
 * every language — so these carry no i18n key. Only the built-in "Default"
 * swatch is translated, and it lives at the render site.
 */
export interface WallpaperOption {
  id: string;
  name: string;
  /** Only the built-in "Default" swatch is translated; models are proper nouns. */
  key?: string;
  style: string;
}

export const DEFAULT_WALLPAPERS: WallpaperOption[] = [
  { id: INITIAL_WALLPAPER, name: 'Lofi', style: 'bg-gradient-to-r from-purple-400 to-blue-400' },
  { id: 'https://i.pinimg.com/236x/db/7f/38/db7f38192793259a10c2268157e87791.jpg', name: 'Believe That 1', style: 'bg-gradient-to-r from-orange-300 to-rose-300' },
  { id: 'https://i.pinimg.com/736x/7b/56/f1/7b56f15f181c1e1b5e96924d449dabfa.jpg', name: 'Samba OG', style: 'bg-gradient-to-r from-indigo-900 to-purple-900' },
  { id: 'https://i.pinimg.com/736x/0d/5c/ad/0d5cadf1e6ca443671904e46ed6d2e99.jpg', name: 'Adistar Control 5', style: 'bg-gradient-to-r from-emerald-800 to-teal-800' }
];
