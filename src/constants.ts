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

export const AUDIENCES = [
  { value: 'brand_client', labelKey: 'audience.brandClient' },
  { value: 'top_management', labelKey: 'audience.topManagement' },
  { value: 'cross_dept', labelKey: 'audience.crossDept' },
  { value: 'subordinates', labelKey: 'audience.subordinates' }
];
export const TONES = [
  { value: 'professional', labelKey: 'tone.professional' },
  { value: 'strict_urgent', labelKey: 'tone.strictUrgent' },
  { value: 'collaborative', labelKey: 'tone.collaborative' }
];
export const FORMATS = [
  { value: 'wechat_zalo', labelKey: 'format.groupChat' },
  { value: 'formal_email', labelKey: 'format.formalEmail' },
  { value: 'action_list', labelKey: 'format.actionList' }
];
