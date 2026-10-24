export type Language = 'Auto' | 'Vietnamese' | 'English' | 'Chinese (Simplified)' | 'Chinese (Traditional)' | 'Indonesian' | 'Burmese';

export type Audience = 'brand_client' | 'top_management' | 'cross_dept' | 'subordinates' | 'expert';
export type Tone = 'professional' | 'strict_urgent' | 'collaborative' | 'persuasive' | 'humble';
export type Length = 'short' | 'standard' | 'detailed';
export type Format = 'wechat_zalo' | 'formal_email' | 'action_list';

export interface VocabItem {
  id: string;
  term: string;
  vi: string;
  en: string;
  zh_cn: string;
  zh_tw: string;
  id_lang: string;
  my: string;
  enabled?: boolean | string;
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

export type GlobalLanguage = 'en' | 'vi' | 'zh-CN' | 'zh-TW';

export type BackgroundEffect = 'none' | 'particles' | 'liquid' | 'aurora' | 'waves';

/** A wallpaper the user added themselves, with a label for the gallery. */
export interface SavedWallpaper {
  url: string;
  name: string;
}

export type UiTheme = 'system' | 'light' | 'dark' | 'cyberpunk' | 'industrial';

/**
 * How a copy button renders the model's Markdown onto the clipboard.
 *
 * - `plain`      markers removed; the clipboard also carries an HTML flavour, so
 *                apps that accept rich text still paste real bold.
 * - `unicode`    bold spans become Unicode bold glyphs, which survive anywhere.
 *                The alphabet only covers A-Z, a-z and 0-9, so a span holding
 *                Vietnamese diacritics or Chinese is left plain.
 * - `uppercase`  bold spans are upper-cased — the emphasis Vietnamese keeps but
 *                Chinese and Japanese cannot show.
 * - `markdown`   the raw text, for apps that parse it themselves.
 */
export type CopyFormat = 'plain' | 'unicode' | 'uppercase' | 'markdown';

export interface UserPreferences {
  /** The single theme control. 'system' follows the OS light/dark setting. */
  theme?: UiTheme;
  backgroundImage?: string;
  savedWallpapers: SavedWallpaper[];
  backgroundEffect: BackgroundEffect;
  /** The four stops TypographySection offers and App.tsx maps to a class. */
  fontSize?: 'sm' | 'base' | 'lg' | 'xl';
  /** The four faces TypographySection offers and App.tsx maps to a class. */
  fontFamily?: 'sans' | 'mono' | 'serif' | 'playfair';
  /** What the copy buttons put on the clipboard. Defaults to 'plain'. */
  copyFormat?: CopyFormat;
}

export interface AppState {
  globalLanguage: GlobalLanguage;
  settings: AISettings;
  lastOutputs: {
    translatedText: string;
    generatedReply: string;
    summary: string;
    subject?: string;
  };
}

export interface HistoryItem {
  id: string;
  type: 'translate' | 'compose' | 'talk';
  timestamp: number;
  input: string;
  output: string;
  fromLang?: string;
  toLang?: string;
  meta?: {
    tone?: string;
    format?: string;
  };
}
