export const STORAGE_KEYS = {
  SETTINGS: 'sra_settings',
  VOCAB: 'sra_vocab',
  LAST_OUTPUTS: 'sra_last_outputs',
  CONTEXT: 'sra_context',
  THEME: 'sra_theme',
  HISTORY: 'sra_history',
  STRUCTURED_SUMMARY: 'sra_structured_summary',
  GLOBAL_LANGUAGE: 'sra_global_language',
  TRANSLATION_CACHE: 'sra_translation_cache',
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
