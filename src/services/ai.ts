import { AISettings, VocabItem } from '../types';
import { matchGlossary, serializeGlossary } from './glossary';
import axios from 'axios';

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  /**
   * The glossary payload for one request, matched against the exact text that
   * is about to be sent. It runs here rather than in the caller so that text
   * the caller assembled after the fact — OCR output appended to the typed
   * input, compose's context plus requirements — is covered too, and so the
   * chips the user sees are built from the same matchGlossary() call.
   */
  private buildGlossary(sourceText: string, vocab: VocabItem[], targetLang: string): string {
    return serializeGlossary(matchGlossary(sourceText, vocab, targetLang));
  }

  async extractTextFromImage(imagePayload: string): Promise<string> {
    try {
      const response = await axios.post('/api/ocr', {
        image: imagePayload,
        model: this.settings.model
      });
      return response.data.extractedText;
    } catch (err: any) {
      console.error('OCR error:', err);
      throw new Error(err.response?.data?.error || 'Image text extraction failed');
    }
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string, summarize: boolean = false, onChunk?: (chunk: string) => void) {
    try {
      const glossary = this.buildGlossary(text, vocab, targetLang);
      
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          targetLang,
          glossary, // Gửi Prompt Glossary đã dựng sẵn sang Backend
          image,
          summarize,
          model: this.settings.model
        })
      });
      
      if (!response.ok) {
        let errData;
        try {
          errData = await response.json();
        } catch(e) {
          throw new Error('Translation failed');
        }
        throw new Error(errData.error || errData.details || 'Translation failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream available');
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        // Usage is logged server-side by /api/translate itself.
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }
      
      return accumulatedText;
    } catch (err: any) {
      console.error('Translation error:', err);
      throw new Error(err.message || 'Translation failed');
    }
  }

  async compose(
    contextText: string, 
    requirements: string, 
    params: { audience: string; tone: string; length?: string; lang: string; format: string; goal?: string }, 
    vocab: VocabItem[],
    structuredSummary?: any,
    onChunk?: (chunk: string) => void
  ) {
    try {
      const glossary = this.buildGlossary(contextText + " " + requirements, vocab, params.lang);
      
      const response = await axios.post('/api/compose', {
        contextText,
        requirements,
        params,
        glossary,
        structuredSummary,
        model: this.settings.model
      });
      
      // Usage is logged server-side by /api/compose itself.
      const generatedReply = response.data.generatedReply;

      if (onChunk) {
        onChunk(generatedReply);
      }
      return generatedReply;
    } catch (err: any) {
      console.error('Compose error:', err);
      throw new Error(err.response?.data?.error || 'Compose failed');
    }
  }

  // NOTE: still a stub — returns metadata only, no extraction is performed server-side.
  async extractStructuredSummary(text: string, sourceLang: string, contextSource: 'original' | 'translated'): Promise<any> {
    return { meta: { sourceLanguage: sourceLang, contextSource, extractedAtIso: new Date().toISOString() } };
  }
}