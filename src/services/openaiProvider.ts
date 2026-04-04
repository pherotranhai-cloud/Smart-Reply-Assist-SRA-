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
        'Content-Type': 'application/json',
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
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        response_format: params.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
        stream: params.stream,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.error?.message || error.message || `HTTP error! status: ${response.status}`);
    }

    if (params.stream && params.onChunk) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6));
                const textChunk = data.choices[0]?.delta?.content || '';
                fullText += textChunk;
                params.onChunk(textChunk);
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }
      return { text: fullText };
    }

    const data = await response.json();
    return { text: data.choices[0].message.content.trim() };
  }
}
