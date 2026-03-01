import { AIProvider, GenerateParams, ModelInfo } from './providers';
import { ProviderSettings } from '../types';

export class OpenAIProvider implements AIProvider {
  constructor(private settings: ProviderSettings) {}

  async listModels(): Promise<ModelInfo[]> {
    const url = this.settings.baseUrl.endsWith('/') 
      ? `${this.settings.baseUrl}models`
      : `${this.settings.baseUrl}/models`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
      },
    });

    if (!response.ok) throw new Error('Failed to list models');
    const data = await response.json();
    return data.data.map((m: any) => ({ id: m.id, name: m.id }));
  }

  async generate(params: GenerateParams): Promise<{ text: string }> {
    const url = this.settings.baseUrl.endsWith('/') 
      ? `${this.settings.baseUrl}chat/completions`
      : `${this.settings.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        response_format: params.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.error?.message || error.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { text: data.choices[0].message.content.trim() };
  }
}
