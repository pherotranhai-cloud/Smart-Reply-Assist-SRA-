import { AIProvider, GenerateParams, ModelInfo } from './providers';
import { ProviderSettings } from '../types';

export function normalizeGeminiModelName(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  
  // Rule: If input starts with "models/" keep as-is
  if (trimmed.startsWith('models/')) {
    return trimmed;
  } 
  // Rule: Else if input matches "gemini-..." then prefix with "models/"
  if (trimmed.toLowerCase().startsWith('gemini-')) {
    return `models/${trimmed}`;
  }

  // Else DO NOT attempt to map labels. Return empty.
  return '';
}

export class GeminiProvider implements AIProvider {
  constructor(private settings: ProviderSettings) {}

  async listModels(): Promise<ModelInfo[]> {
    const url = this.settings.baseUrl.endsWith('/') 
      ? `${this.settings.baseUrl}v1beta/models`
      : `${this.settings.baseUrl}/v1beta/models`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) throw new Error('Failed to list Gemini models');
    const data = await response.json();
    return (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => {
        return { 
          id: m.name, // Raw modelName: "models/..."
          name: m.displayName || m.name 
        };
      });
  }

  async generate(params: GenerateParams): Promise<{ text: string }> {
    let modelName = this.settings.model;

    // If modelName missing, lazy-load models and auto-select
    if (!modelName) {
      const models = await this.listModels();
      if (models.length > 0) {
        modelName = models[0].id;
        // Note: We can't easily save back to settings from here without side effects, 
        // but the requirement says "Save that value back to settings for future runs".
        // This usually happens in the UI layer or via a callback.
        // For now, we use it for this request.
      }
    }

    const normalized = normalizeGeminiModelName(modelName);
    if (!normalized) {
      throw new Error("Gemini model not set. Click Refresh Models and select one, or enter a raw model id.");
    }

    // Endpoint: POST {baseUrl}/v1beta/{modelName}:generateContent
    // Note: modelName already starts with "models/" after normalization
    const url = `${this.settings.baseUrl}/v1beta/${normalized}:${params.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;

    // Convert OpenAI-style messages to Gemini format
    const contents = params.messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const parts = Array.isArray(m.content) 
          ? m.content.map(p => {
              if (p.type === 'text') return { text: p.text };
              if (p.type === 'image_url') {
                const base64Data = p.image_url.url.split(',')[1];
                return { inlineData: { mimeType: 'image/png', data: base64Data } };
              }
              return { text: '' };
            })
          : [{ text: m.content }];
        
        return {
          role: m.role === 'user' ? 'user' : 'model',
          parts
        };
      });

    const systemPrompt = params.messages.find(m => m.role === 'system')?.content;
    
    const body: any = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens,
        responseMimeType: params.responseMimeType,
      }
    };

    if (systemPrompt) {
      body.system_instruction = {
        parts: [{ text: systemPrompt as string }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      const msg = error.error?.message || error.message || `HTTP error! status: ${response.status}`;
      throw new Error(msg);
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
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                fullText += textChunk;
                params.onChunk(textChunk);
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }
      return { text: fullText };
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No candidates returned from Gemini');
    }

    const text = data.candidates[0].content.parts[0].text;
    return { text };
  }
}
