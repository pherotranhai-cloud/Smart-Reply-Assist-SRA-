import { IAITransport } from './IAITransport';

export const extensionTransport: IAITransport = {
  async call(type, settings, params) {
    const response = await chrome.runtime.sendMessage({
      type,
      settings,
      params
    });
    if (response.error) throw new Error(response.error);
    return response;
  }
};
