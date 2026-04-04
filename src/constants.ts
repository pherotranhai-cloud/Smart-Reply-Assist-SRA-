import { AISettings, AppState } from './types';

export const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'openai',
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
};

export const DEFAULT_STATE: AppState = {
  themeMode: 'system',
  globalLanguage: 'en',
  settings: DEFAULT_SETTINGS,
  lastOutputs: {
    translatedText: '',
    generatedReply: '',
    summary: '',
    contextSource: 'translated',
  },
  structuredSummary: undefined,
};

export const LANGUAGES = [
  'Auto',
  'Vietnamese',
  'English',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Indonesian',
  'Burmese',
];

export const AUDIENCES = ['Internal-Team', 'Taiwan-Manager', 'Foreigner-Manager', 'Customer'];
export const TONES = ['Professional', 'Polite', 'Firm', 'Friendly', 'Apologetic'];
export const FORMATS = ['Email', 'WeChat', 'Chat', 'Report-Short', 'Report-Detailed'];
