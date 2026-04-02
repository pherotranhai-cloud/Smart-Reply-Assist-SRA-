import { ProviderSettings } from '../types';

export interface ModelInfo {
  id: string;
  name: string;
}

export interface GenerateParams {
  system?: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string | any[] }[];
  temperature?: number;
  maxTokens?: number;
  responseMimeType?: 'application/json' | 'text/plain';
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface AIProvider {
  listModels(): Promise<ModelInfo[]>;
  generate(params: GenerateParams): Promise<{ text: string }>;
}
