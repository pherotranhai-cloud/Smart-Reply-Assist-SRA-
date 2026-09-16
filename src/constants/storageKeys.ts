export const STORAGE_KEYS = {
  SETTINGS: 'sra_settings',
  VOCAB: 'sra_vocab',
  LAST_OUTPUTS: 'sra_last_outputs',
  CONTEXT: 'sra_context',
  // Legacy: written by the old Settings -> Theme Mode control. Nothing reads it
  // any more — useUserPreferences migrates off it and then deletes it — but a
  // reset still has to wipe it for installs that have not opened Settings yet.
  THEME: 'sra_theme',
  HISTORY: 'smart_reply_history',
  STRUCTURED_SUMMARY: 'sra_structured_summary',
  GLOBAL_LANGUAGE: 'sra_global_language',
  TRANSLATION_CACHE: 'sra_translation_cache',
  // Written by useUserPreferences. Do not rename without a migration:
  // existing installs hold their theme and wallpaper under this key.
  USER_PREFERENCES: 'app_user_preferences',
};

export const DATA_KEYS = [
  STORAGE_KEYS.LAST_OUTPUTS,
  STORAGE_KEYS.CONTEXT,
  STORAGE_KEYS.HISTORY,
  STORAGE_KEYS.STRUCTURED_SUMMARY
];

export const SETTINGS_KEYS = [
  STORAGE_KEYS.SETTINGS,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.VOCAB
];
