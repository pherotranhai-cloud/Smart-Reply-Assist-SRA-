import { IStorage } from './IStorage';

const SETTINGS_KEYS = ['sra_settings', 'sra_theme'];

export const chromeStorage: IStorage = {
  async get<T>(key: string): Promise<T | null> {
    const area = SETTINGS_KEYS.includes(key) ? 'sync' : 'local';
    const result = await chrome.storage[area].get(key);
    return (result[key] as T) || null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    const area = SETTINGS_KEYS.includes(key) ? 'sync' : 'local';
    await chrome.storage[area].set({ [key]: value });
  },

  async remove(key: string): Promise<void> {
    const area = SETTINGS_KEYS.includes(key) ? 'sync' : 'local';
    await chrome.storage[area].remove(key);
  },

  async multiGet<T>(keys: string[]): Promise<Record<string, T | null>> {
    const localKeys = keys.filter(k => !SETTINGS_KEYS.includes(k));
    const syncKeys = keys.filter(k => SETTINGS_KEYS.includes(k));

    const [localRes, syncRes] = await Promise.all([
      localKeys.length ? chrome.storage.local.get(localKeys) : Promise.resolve({}),
      syncKeys.length ? chrome.storage.sync.get(syncKeys) : Promise.resolve({}),
    ]);

    const result: Record<string, T | null> = {};
    keys.forEach(k => {
      result[k] = (localRes[k] ?? syncRes[k] ?? null) as T | null;
    });
    return result;
  },

  async multiRemove(keys: string[]): Promise<void> {
    const localKeys = keys.filter(k => !SETTINGS_KEYS.includes(k));
    const syncKeys = keys.filter(k => SETTINGS_KEYS.includes(k));

    await Promise.all([
      localKeys.length ? chrome.storage.local.remove(localKeys) : Promise.resolve(),
      syncKeys.length ? chrome.storage.sync.remove(syncKeys) : Promise.resolve(),
    ]);
  }
};
