import { VocabItem, AISettings, AppState, HistoryItem, ConversationContext } from '../types';
import { DEFAULT_STATE } from '../constants';
import { storage as adapter } from '../runtime/storage';
import { STORAGE_KEYS, DATA_KEYS } from '../constants/storageKeys';

export const storage = {
  async getSettings(): Promise<AISettings> {
    const settings = await adapter.get<AISettings>(STORAGE_KEYS.SETTINGS);
    if (!settings) return DEFAULT_STATE.settings;
    // Migration: if settings is in old format, convert to new format
    if (!(settings as any).activeProvider) {
      return DEFAULT_STATE.settings;
    }
    return settings;
  },

  async setSettings(settings: AISettings): Promise<void> {
    await adapter.set(STORAGE_KEYS.SETTINGS, settings);
  },

  async getVocab(): Promise<VocabItem[]> {
    return (await adapter.get<VocabItem[]>(STORAGE_KEYS.VOCAB)) || [];
  },

  async setVocab(vocab: VocabItem[]): Promise<void> {
    await adapter.set(STORAGE_KEYS.VOCAB, vocab);
  },

  async getLastOutputs(): Promise<AppState['lastOutputs']> {
    return (await adapter.get<AppState['lastOutputs']>(STORAGE_KEYS.LAST_OUTPUTS)) || DEFAULT_STATE.lastOutputs;
  },

  async setLastOutputs(lastOutputs: AppState['lastOutputs']): Promise<void> {
    await adapter.set(STORAGE_KEYS.LAST_OUTPUTS, lastOutputs);
  },

  async getContext(): Promise<ConversationContext | null> {
    return await adapter.get<ConversationContext>(STORAGE_KEYS.CONTEXT);
  },

  async setContext(context: ConversationContext | null): Promise<void> {
    if (context === null) {
      await adapter.remove(STORAGE_KEYS.CONTEXT);
    } else {
      await adapter.set(STORAGE_KEYS.CONTEXT, context);
    }
  },

  async getTheme(): Promise<'dark' | 'light' | 'system'> {
    return (await adapter.get<'dark' | 'light' | 'system'>(STORAGE_KEYS.THEME)) || 'system';
  },

  async setTheme(theme: 'dark' | 'light' | 'system'): Promise<void> {
    await adapter.set(STORAGE_KEYS.THEME, theme);
  },

  async getHistory(): Promise<HistoryItem[]> {
    return (await adapter.get<HistoryItem[]>(STORAGE_KEYS.HISTORY)) || [];
  },

  async addHistory(item: Omit<HistoryItem, 'id' | 'timestamp'>): Promise<void> {
    const history = await this.getHistory();
    const newItem: HistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const updated = [newItem, ...history].slice(0, 20);
    await adapter.set(STORAGE_KEYS.HISTORY, updated);
  },

  async clearSessionData(): Promise<void> {
    await adapter.multiRemove(DATA_KEYS);
  },

  async getStructuredSummary(): Promise<any | null> {
    return await adapter.get(STORAGE_KEYS.STRUCTURED_SUMMARY);
  },

  async setStructuredSummary(summary: any | null): Promise<void> {
    if (summary === null) {
      await adapter.remove(STORAGE_KEYS.STRUCTURED_SUMMARY);
    } else {
      await adapter.set(STORAGE_KEYS.STRUCTURED_SUMMARY, summary);
    }
  }
};
