import { IAITransport } from './IAITransport';
import { OpenAIProvider } from '../../services/openaiProvider';
import { GeminiProvider } from '../../services/geminiProvider';

export const webTransport: IAITransport = {
  async call(type, settings, params) {
    const active = settings.activeProvider;
    const provider = active === 'openai' 
      ? new OpenAIProvider(settings.openai) 
      : new GeminiProvider(settings.gemini);

    if (type === 'LIST_MODELS') {
      const models = await provider.listModels();
      return { models };
    }

    if (type === 'GENERATE') {
      return await provider.generate(params);
    }

    if (type === 'RESET_SESSION') {
      return { ok: true };
    }

    throw new Error(`Unknown transport type: ${type}`);
  }
};
