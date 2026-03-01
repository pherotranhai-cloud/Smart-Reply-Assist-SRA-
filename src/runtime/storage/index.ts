import { chromeStorage } from './chromeStorage';
import { webStorage } from './webStorage';
import { IStorage } from './IStorage';

export const storage: IStorage = typeof chrome !== 'undefined' && chrome.storage 
  ? chromeStorage 
  : webStorage;
