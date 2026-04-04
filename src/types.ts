export type Language = 'Auto' | 'Vietnamese' | 'English' | 'Chinese (Simplified)' | 'Chinese (Traditional)' | 'Indonesian' | 'Burmese';

export type Audience = 'Internal-Team' | 'Taiwan-Manager' | 'Foreigner-Manager' | 'Customer';
export type Tone = 'Professional' | 'Polite' | 'Firm' | 'Friendly' | 'Apologetic';
export type Format = 'Email' | 'WeChat' | 'Chat' | 'Report-Short' | 'Report-Detailed';

export interface VocabItem {
  id: string;
  term: string;
  meaning_vi: string;
  target_en: string;
  target_zh: string;
  enabled: boolean | string;
}

export type ProviderType = 'openai';

export interface ProviderSettings {
  baseUrl: string;
  model: string;
}

export interface AISettings {
  activeProvider: ProviderType;
  openai: ProviderSettings;
}

export interface ConversationContext {
  sourceText: string;
  translatedText: string;
  detectedLanguage?: string;
  targetTranslationLanguage?: string;
  summaryText?: string;
  lastUpdatedIso: string;
  contextSource: 'original' | 'translated';
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';
export type GlobalLanguage = 'en' | 'vi' | 'ja' | 'zh-CN' | 'zh-TW';

export interface StructuredSummary {
  meta: {
    sourceLanguage: string;
    contextSource: 'translated' | 'original';
    extractedAtIso: string;
  };
  people_and_roles: {
    name: string;
    role_title: string;
    honorific: string;
    organization: string;
    confidence: number;
  }[];
  production_data: {
    item: string;
    metric: string;
    value: string | number;
    unit: string;
    timeframe: string;
    confidence: number;
  }[];
  metrics_highlights: string[];
  discipline_and_ownership: {
    discipline: string;
    owner: string;
    responsibility: string;
    confidence: number;
  }[];
  requests_and_directions: {
    type: 'request' | 'instruction' | 'direction' | 'decision_needed' | 'escalation';
    content: string;
    priority: 'P0' | 'P1' | 'P2';
    due: string;
    blocking: boolean;
    confidence: number;
  }[];
  risks_gaps_questions: {
    gap: string;
    question: string;
    priority: 'P0' | 'P1' | 'P2';
  }[];
  short_summary: {
    bullets: string[];
    items_to_respond: string[];
  };
}

export interface AppState {
  themeMode: ThemeMode;
  globalLanguage: GlobalLanguage;
  settings: AISettings;
  lastOutputs: {
    translatedText: string;
    generatedReply: string;
    summary: string;
    subject?: string;
    contextSource?: 'original' | 'translated';
  };
  structuredSummary?: StructuredSummary;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  type: 'translate' | 'compose';
  input: string;
  output: string;
}
