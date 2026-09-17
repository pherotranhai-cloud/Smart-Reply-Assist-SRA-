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
        model: this.settings.openai.model
      });
      return response.data.extractedText;
    } catch (err: any) {
      console.error('OCR error:', err);
      throw new Error(err.response?.data?.error || 'Image text extraction failed');
    }
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string, summarize: boolean = false, onChunk?: (chunk: string) => void, isAuto: boolean = false) {
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
          isAuto,
          model: this.settings.openai.model
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
        if (done) {
          try {
            const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';
            fetch(`${SERVER_BASE_URL}/api/public/log`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                task_type: image ? 'ocr_translate' : 'translate',
                input_text: text,
                output_text: accumulatedText,
                from_lang: 'auto',
                to_lang: targetLang
              })
            }).catch(logErr => {
              console.error('[Log Forwarding Failed]:', logErr);
            });
          } catch (logErr) {
            console.error('SSE logger failed:', logErr);
          }
          break;
        }
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
        model: this.settings.openai.model
      });
      
      const generatedReply = response.data.generatedReply;
      
      try {
        const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';
        fetch(`${SERVER_BASE_URL}/api/public/log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            task_type: 'compose',
            input_text: contextText + '\n' + requirements,
            output_text: generatedReply,
            from_lang: 'auto',
            to_lang: params.lang
          })
        }).catch(logErr => {
          console.error('[Log Forwarding Failed]:', logErr);
        });
      } catch (logErr) {
        console.error('Compose logger failed:', logErr);
      }

      if (onChunk) {
        onChunk(generatedReply);
      }
      return generatedReply;
    } catch (err: any) {
      console.error('Compose error:', err);
      throw new Error(err.response?.data?.error || 'Compose failed');
    }
  }

  async talkStream(text: string, targetLang: string, onSentence: (sentence: string) => void, onComplete: (fullText: string) => void) {
    try {
      const response = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang, model: this.settings.openai.model }),
      });

      if (!response.ok) {
        throw new Error(`Talk HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not yet supported in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullText = '';
      let buffer = '';

      const isChineseOrSimilar = (lang: string) => lang.includes('Chinese') || lang.includes('Burmese');

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        
        // Parse SSE stream
        const lines = chunkValue.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                const token = data.choices[0].delta.content;
                fullText += token;
                buffer += token;

                // Module 1: Check for complete thought (15 chars or punctuation)
                const isContinuousLang = isChineseOrSimilar(targetLang);
                
                const hasPunctuation = /[.!?。！？,，]\s*$/.test(buffer);
                const hasEnoughWords = isContinuousLang ? buffer.length > 15 : buffer.trim().split(/\s+/).length >= 5;

                if (hasPunctuation || hasEnoughWords) {
                  onSentence(buffer.trim());
                  buffer = ''; 
                }
              }
            } catch (e) {
              // Ignore parse errors on incomplete JSON chunks
            }
          }
        }
      }
      
      // Flush remaining buffer
      if (buffer.trim()) {
        onSentence(buffer.trim());
      }

      onComplete(fullText);
      return fullText;
    } catch (err: any) {
      console.error('Talk stream error:', err);
      throw new Error(err.message || 'Talk sequence failed');
    }
  }

  // NOTE: still a stub — returns metadata only, no extraction is performed server-side.
  async extractStructuredSummary(text: string, sourceLang: string, contextSource: 'original' | 'translated'): Promise<any> {
    return { meta: { sourceLanguage: sourceLang, contextSource, extractedAtIso: new Date().toISOString() } };
  }
}