import { Gauge, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { AISettings, AppState, Audience, Tone, Length, Format } from './types';

export const DEFAULT_AI_MODEL = 'gpt-5.6-luna';

/**
 * Every model the picker offers, and everything the picker needs to draw one.
 *
 * The ids and the per-model icon/caption used to live apart — the list here,
 * the presentation in ModelSection — so adding a fourth model silently gave it
 * a fallback icon and no caption. One entry is now the whole story.
 *
 * `displayName` is for ids whose own text does not read as a product name;
 * leave it out and the id is shown as-is. Keep every caption translation under
 * ~30 characters, because the row truncates at 320px.
 */
export interface ModelMeta {
  displayName?: string;
  icon: LucideIcon;
  captionKey: string;
}

export const MODEL_REGISTRY: Record<string, ModelMeta> = {
  'gpt-5.6-luna': { displayName: 'GPT-5.6 Luna', icon: Sparkles, captionKey: 'model.capability.luna' },
  'gpt-4o': { icon: Zap, captionKey: 'model.capability.gpt4o' },
  'gpt-3.5-turbo': { icon: Gauge, captionKey: 'model.capability.gpt35' },
};

// Derived, so the list and the registry cannot drift apart. Object key order is
// insertion order for string keys, which is the order the picker renders.
export const SUPPORTED_MODELS = Object.keys(MODEL_REGISTRY) as readonly string[];

export const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'openai',
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: DEFAULT_AI_MODEL,
  },
};

export const DEFAULT_STATE: AppState = {
  globalLanguage: 'en',
  settings: DEFAULT_SETTINGS,
  lastOutputs: {
    translatedText: '',
    generatedReply: '',
    summary: '',
  },
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

export const LANGUAGE_FLAGS: Record<string, string> = {
  'Auto': '✨',
  'Vietnamese': '🇻🇳',
  'English': '🇬🇧',
  'Chinese (Simplified)': '🇨🇳',
  'Chinese (Traditional)': '🇹🇼',
  'Indonesian': '🇮🇩',
  'Burmese': '🇲🇲'
};

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
