import { VocabItem, AISettings, AppState, HistoryItem, ConversationContext, GlobalLanguage } from '../types';
import { DEFAULT_STATE } from '../constants';
import { STORAGE_KEYS, DATA_KEYS } from '../constants/storageKeys';

const adapter = {
  async get<T>(key: string): Promise<T | null> {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as T;
    } catch (e) {
      return stored as unknown as T;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach(key => localStorage.removeItem(key));
  }
};

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

  async getLastSyncTime(): Promise<string | null> {
    return await adapter.get<string>('sra_last_sync_time');
  },

  async setLastSyncTime(isoString: string): Promise<void> {
    await adapter.set('sra_last_sync_time', isoString);
  },

  async syncWithCloud(): Promise<{ success: boolean; count?: number; message?: string }> {
    try {
      const hostname = window.location.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const isNetlify = hostname.includes('netlify.app');
      
      // Determine base URL based on environment
      let apiUrl = '/api/import-vocab';
      if (isLocalhost) {
        // Vite proxy will handle /api and redirect to localhost:8888/.netlify/functions
        apiUrl = '/api/import-vocab';
      } else if (isNetlify) {
        // Use direct function URL on Netlify to avoid redirect overhead
        apiUrl = '/.netlify/functions/import-vocab';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Không tìm thấy file Google Sheets. Vui lòng kiểm tra ID hoặc quyền chia sẻ');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.status === 'success' && Array.isArray(result.data)) {
        await this.setVocab(result.data);
        await this.setLastSyncTime(new Date().toISOString());
        return { success: true, count: result.count, message: result.message };
      } else {
        throw new Error(result.message || 'Invalid data format received from cloud');
      }
    } catch (error: any) {
      console.error('Cloud sync failed:', error);
      return { success: false, message: error.message };
    }
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
  
  async getGlobalLanguage(): Promise<GlobalLanguage> {
    return (await adapter.get<GlobalLanguage>(STORAGE_KEYS.GLOBAL_LANGUAGE)) || 'en';
  },

  async setGlobalLanguage(lang: GlobalLanguage): Promise<void> {
    await adapter.set(STORAGE_KEYS.GLOBAL_LANGUAGE, lang);
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
