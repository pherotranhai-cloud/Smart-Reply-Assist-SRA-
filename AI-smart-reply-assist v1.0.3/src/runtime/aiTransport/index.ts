import { IAITransport } from './IAITransport';
import { extensionTransport } from './extensionTransport';
import { webTransport } from './webTransport';

export const aiTransport: IAITransport = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage
  ? extensionTransport
  : webTransport;
