import { VocabItem, AISettings, AppState, HistoryItem, GlobalLanguage } from '../types';
import { DEFAULT_STATE } from '../constants';
import { STORAGE_KEYS, DATA_KEYS } from '../constants/storageKeys';

import { safeLocalStorage } from '../utils/safeStorage';
import { normalizeVocabItem } from '../../shared/vocabNormalize';

const adapter = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const stored = safeLocalStorage.getItem(key);
      if (!stored) return null;
      try {
        return JSON.parse(stored) as T;
      } catch (e) {
        return stored as unknown as T;
      }
    } catch (err) {
      console.warn("Storage access not allowed or insecure:", err);
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      safeLocalStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("Storage set not allowed or insecure:", err);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      safeLocalStorage.removeItem(key);
    } catch (err) {
      console.warn("Storage remove not allowed or insecure:", err);
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    try {
      keys.forEach(key => safeLocalStorage.removeItem(key));
    } catch (err) {
      console.warn("Storage multiRemove not allowed or insecure:", err);
    }
  }
};

/**
 * Keys the link-context feature wrote, now gone from STORAGE_KEYS. Reset App is
 * a blanket localStorage.clear(), so a reset would still catch them — but
 * nobody resets a working install, and `sra_context` holds a whole
 * source-plus-translation pair in the same quota saved wallpapers live inline
 * in. Startup sweeps them rather than waiting for a reset that never comes.
 */
const RETIRED_CONTEXT_KEYS = ['sra_context', 'sra_structured_summary'];

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
    const stored = await adapter.get<VocabItem[]>(STORAGE_KEYS.VOCAB);
    // Heals vocab saved before the importer shape fix (meaning_vi/target_en/…)
    // that's still sitting on a returning user's device — a no-op otherwise.
    // adapter.get() falls back to the raw string when JSON.parse fails, so
    // guard against a corrupted, non-array value instead of throwing.
    return Array.isArray(stored) ? stored.map(normalizeVocabItem) : [];
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

      const text = await response.text();

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Không tìm thấy file Google Sheets. Vui lòng kiểm tra ID hoặc quyền chia sẻ');
        }
        // const errorData = await response.json().catch(() => ({})); // Removed to avoid parsing error
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = JSON.parse(text); // Parse manually
      
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
    const stored = await adapter.get<AppState['lastOutputs'] & { contextSource?: string }>(STORAGE_KEYS.LAST_OUTPUTS);
    // adapter.get() hands back the raw string when JSON.parse fails, so a
    // corrupted value has to reach the default instead of being spread.
    if (!stored || typeof stored !== 'object') return DEFAULT_STATE.lastOutputs;
    // `contextSource` left AppState with the link-context feature. What is read
    // here is spread into every subsequent write, so without this an upgraded
    // install would keep re-persisting the dead field for good.
    const { contextSource: _retired, ...outputs } = stored;
    return outputs;
  },

  async setLastOutputs(lastOutputs: AppState['lastOutputs']): Promise<void> {
    await adapter.set(STORAGE_KEYS.LAST_OUTPUTS, lastOutputs);
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
    const updated = [newItem, ...history].slice(0, 100);
    await adapter.set(STORAGE_KEYS.HISTORY, updated);
  },

  async clearHistory(): Promise<void> {
    await adapter.remove(STORAGE_KEYS.HISTORY);
  },

  async clearSessionData(): Promise<void> {
    await adapter.multiRemove(DATA_KEYS);
  },

  /** See RETIRED_CONTEXT_KEYS. Cheap and idempotent — safe on every launch. */
  async dropRetiredContextKeys(): Promise<void> {
    await adapter.multiRemove(RETIRED_CONTEXT_KEYS);
  },

  async getTranslationCache(): Promise<Record<string, { translatedText: string, timestamp: number }>> {
    return (await adapter.get<Record<string, { translatedText: string, timestamp: number }>>(STORAGE_KEYS.TRANSLATION_CACHE)) || {};
  },

  async setTranslationCache(cache: Record<string, { translatedText: string, timestamp: number }>): Promise<void> {
    await adapter.set(STORAGE_KEYS.TRANSLATION_CACHE, cache);
  }
};
