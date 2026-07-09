// Memory fallback if localStorage is completely blocked/insecure or throws SecurityError
const memoryStorage: Record<string, string> = {};

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (e) {
      return memoryStorage[key] || null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      } else {
        memoryStorage[key] = value;
      }
    } catch (e) {
      memoryStorage[key] = value;
    }
  },
  removeItem(key: string): void {
    try {
      if (window.localStorage) {
        window.localStorage.removeItem(key);
      } else {
        delete memoryStorage[key];
      }
    } catch (e) {
      delete memoryStorage[key];
    }
  }
};
