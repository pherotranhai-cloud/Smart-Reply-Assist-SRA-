import { AISettings, VocabItem } from '../types';
import axios from 'axios';

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  /**
   * Khôi phục logic buildGlossaryPrompt từ phiên bản cũ
   * Tối ưu hóa cho tiếng Trung và đa ngôn ngữ
   */
  private buildGlossaryPrompt(vocab: VocabItem[], targetLang: string, sourceText?: string): string {
    if (!sourceText) return '';
    
    const rawInput = sourceText.trim();
    const rawInputLower = rawInput.toLowerCase();
    
    // Helper: Remove Vietnamese tones for fuzzy matching
    const removeVietnameseTones = (str: string) => {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    };
    
    const rawInputNoTones = removeVietnameseTones(rawInput);

    let targetKey: 'meaning_vi' | 'target_en' | 'target_zh' = 'target_en'; 
    const targetLangLower = targetLang.toLowerCase();
    if (targetLangLower.includes('vi')) targetKey = 'meaning_vi';
    else if (targetLangLower.includes('zh') || targetLangLower.includes('chinese')) targetKey = 'target_zh';

    const matches: { term: string; translation: string }[] = [];
    const seen = new Set<string>();

    // Sort by length descending to match longest terms first (preventing sub-term overrides)
    const sortedVocab = [...vocab].sort((a, b) => {
      const lenA = Math.max((a.meaning_vi?.length || 0), (a.target_en?.length || 0), (a.target_zh?.length || 0));
      const lenB = Math.max((b.meaning_vi?.length || 0), (b.target_en?.length || 0), (b.target_zh?.length || 0));
      return lenB - lenA;
    });

    sortedVocab.forEach(item => {
      // Backward compatibility: handle undefined/null as enabled (true)
      if (item.enabled === false || String(item.enabled).toLowerCase() === 'false') return;
      
      const vi = item.meaning_vi ? String(item.meaning_vi).trim() : '';
      const en = item.target_en ? String(item.target_en).trim() : '';
      const zh = item.target_zh ? String(item.target_zh).trim() : '';

      const viNorm = vi.toLowerCase();
      const enNorm = en.toLowerCase();
      const viNoTones = removeVietnameseTones(vi);

      let matchedSource = null;
      
      // RULE 1: Chinese (Ideographic) - Safe to use includes
      if (zh && rawInput.includes(zh)) {
        matchedSource = zh;
      } 
      // RULE 2: English - Use Word Boundary Regex
      else if (enNorm) {
        try {
          const regex = new RegExp(`\\b${enNorm}\\b`, 'i');
          if (regex.test(rawInput)) matchedSource = en;
        } catch (e) {
          if (rawInputLower.includes(enNorm)) matchedSource = en; // Fallback
        }
      }
      // RULE 3: Vietnamese - Scan on tone-removed string + Word Boundary
      if (!matchedSource && viNorm) {
        try {
          const regex = new RegExp(`\\b${viNoTones}\\b`, 'i');
          if (regex.test(rawInputNoTones)) matchedSource = vi;
        } catch (e) {
          if (rawInputNoTones.includes(viNoTones)) matchedSource = vi; // Fallback
        }
      }

      const target = item[targetKey] ? String(item[targetKey]).trim() : '';
      
      if (matchedSource && target && matchedSource.toLowerCase() !== target.toLowerCase() && !seen.has(matchedSource.toLowerCase())) {
        seen.add(matchedSource.toLowerCase());
        matches.push({ term: matchedSource, translation: target });
      }
    });

    if (matches.length === 0) return '';
    
    // Return raw JSON string. Backend handles the XML tags.
    return JSON.stringify(matches);
  }

  async extractTextFromImage(imagePayload: string): Promise<string> {
    try {
      const response = await axios.post('/api/ocr', {
        image: imagePayload
      });
      return response.data.extractedText;
    } catch (err: any) {
      console.error('OCR error:', err);
      throw new Error(err.response?.data?.error || 'Image text extraction failed');
    }
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string, onChunk?: (chunk: string) => void) {
    try {
      // Sử dụng logic so khớp mạnh mẽ vừa khôi phục
      const glossary = this.buildGlossaryPrompt(vocab, targetLang, text);
      
      const response = await axios.post('/api/translate', {
        text,
        targetLang,
        glossary, // Gửi Prompt Glossary đã dựng sẵn sang Backend
        image
      });
      
      const translatedText = response.data.translatedText;
      if (onChunk) {
        onChunk(translatedText);
      }
      return translatedText;
    } catch (err: any) {
      console.error('Translation error:', err);
      throw new Error(err.response?.data?.error || 'Translation failed');
    }
  }

  async compose(
    contextText: string, 
    requirements: string, 
    params: { audience: string; tone: string; lang: string; format: string }, 
    vocab: VocabItem[],
    structuredSummary?: any,
    onChunk?: (chunk: string) => void
  ) {
    try {
      // Khôi phục logic lấy glossary cho cả context và yêu cầu soạn thảo
      const glossary = this.buildGlossaryPrompt(vocab, params.lang, contextText + " " + requirements);
      
      const response = await axios.post('/api/compose', {
        contextText,
        requirements,
        params,
        glossary,
        structuredSummary
      });
      
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

  // Các hàm bổ trợ khác giữ nguyên cấu trúc gọi Backend
  async extractStructuredSummary(text: string, sourceLang: string, contextSource: 'original' | 'translated'): Promise<any> {
    return { meta: { sourceLanguage: sourceLang, contextSource, extractedAtIso: new Date().toISOString() } };
  }

  async summarize(text: string) {
    return 'Summarize not implemented in backend yet';
  }

  async analyzeFileContent(text: string, language: string = 'Vietnamese') {
    return 'AnalyzeFileContent not implemented in backend yet';
  }
}