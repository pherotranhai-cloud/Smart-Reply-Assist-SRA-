import { AISettings, AppState, Audience, Tone, Length, Format } from './types';

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
  { value: 'subordinates', labelKey: 'audience.subordinates' },
  { value: 'expert', labelKey: 'audience.expert' }
];
export const TONES = [
  { value: 'professional', labelKey: 'tone.professional' },
  { value: 'strict_urgent', labelKey: 'tone.strictUrgent' },
  { value: 'collaborative', labelKey: 'tone.collaborative' },
  { value: 'persuasive', labelKey: 'tone.persuasive' },
  { value: 'humble', labelKey: 'tone.humble' }
];
export const LENGTHS = [
  { value: 'short', labelKey: 'length.short' },
  { value: 'standard', labelKey: 'length.standard' },
  { value: 'detailed', labelKey: 'length.detailed' }
];
export const FORMATS = [
  { value: 'wechat_zalo', labelKey: 'format.groupChat' },
  { value: 'formal_email', labelKey: 'format.formalEmail' },
  { value: 'action_list', labelKey: 'format.actionList' }
];

export interface ComposePreset {
  id: string;
  name: string;
  iconName: string;
  settings: {
    audience: Audience;
    tone: Tone;
    length: Length;
    format: Format;
  };
}

export const CORE_PRESETS: ComposePreset[] = [
  {
    id: 'report',
    name: 'Báo cáo lỗi (Urgent)',
    iconName: 'FileText',
    settings: { audience: 'top_management', tone: 'strict_urgent', length: 'short', format: 'wechat_zalo' }
  },
  {
    id: 'explain',
    name: 'Giải trình (Explain)',
    iconName: 'FileSearch',
    settings: { audience: 'brand_client', tone: 'persuasive', length: 'detailed', format: 'formal_email' }
  },
  {
    id: 'remind',
    name: 'Nhắc việc (Remind)',
    iconName: 'Clock',
    settings: { audience: 'cross_dept', tone: 'collaborative', length: 'short', format: 'wechat_zalo' }
  },
  {
    id: 'consult',
    name: 'Hỏi ý kiến (Consult)',
    iconName: 'HelpCircle',
    settings: { audience: 'expert', tone: 'professional', length: 'standard', format: 'wechat_zalo' }
  },
  {
    id: 'announce',
    name: 'Thông báo (Announce)',
    iconName: 'Megaphone',
    settings: { audience: 'subordinates', tone: 'professional', length: 'standard', format: 'wechat_zalo' }
  },
  {
    id: 'custom',
    name: 'Tùy chỉnh (Custom)',
    iconName: 'Settings2',
    settings: { audience: 'cross_dept', tone: 'professional', length: 'standard', format: 'wechat_zalo' }
  }
];
