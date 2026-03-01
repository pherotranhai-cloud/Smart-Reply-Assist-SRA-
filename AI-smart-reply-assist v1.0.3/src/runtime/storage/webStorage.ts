import { IStorage } from './IStorage';

export const webStorage: IStorage = {
  async get<T>(key: string): Promise<T | null> {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as T;
    } catch (e) {
      // If it's not valid JSON, it might be a raw string
      return stored as unknown as T;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },

  async multiGet<T>(keys: string[]): Promise<Record<string, T | null>> {
    const result: Record<string, T | null> = {};
    keys.forEach(key => {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          result[key] = JSON.parse(stored) as T;
        } catch (e) {
          result[key] = stored as unknown as T;
        }
      } else {
        result[key] = null;
      }
    });
    return result;
  },

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach(key => localStorage.removeItem(key));
  }
};
