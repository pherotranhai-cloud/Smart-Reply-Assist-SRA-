export interface IStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  multiGet<T>(keys: string[]): Promise<Record<string, T | null>>;
  multiRemove(keys: string[]): Promise<void>;
}
