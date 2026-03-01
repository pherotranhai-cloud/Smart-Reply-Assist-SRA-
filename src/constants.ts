import { AISettings, AppState } from './types';

export const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'openai',
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-1.5-flash',
  },
};

export const DEFAULT_STATE: AppState = {
  themeMode: 'system',
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
];

export const AUDIENCES = ['Internal-Team', 'Taiwan-Manager', 'Foreigner-Manager', 'Customer'];
export const TONES = ['Professional', 'Polite', 'Firm', 'Friendly', 'Apologetic'];
export const FORMATS = ['Email', 'WeChat', 'Chat', 'Report-Short', 'Report-Detailed'];
