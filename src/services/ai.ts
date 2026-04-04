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
    
    // Sử dụng logic so khớp nguyên bản (Original Source)
    const rawInput = sourceText.trim();
    const rawInputLower = rawInput.toLowerCase();
    
    // Xác định cột dữ liệu đích dựa trên ngôn ngữ chọn
    let targetKey: 'meaning_vi' | 'target_en' | 'target_zh' = 'target_en'; 
    const targetLangLower = targetLang.toLowerCase();
    if (targetLangLower.includes('vi')) targetKey = 'meaning_vi';
    else if (targetLangLower.includes('zh') || targetLangLower.includes('chinese')) targetKey = 'target_zh';

    const matches: string[] = [];
    const seen = new Set<string>();

    // Sắp xếp vocab theo độ dài từ khóa giảm dần để khớp từ dài trước (tránh khớp nhầm từ con)
    const sortedVocab = [...vocab].sort((a, b) => {
      const lenA = Math.max((a.meaning_vi?.length || 0), (a.target_en?.length || 0), (a.target_zh?.length || 0));
      const lenB = Math.max((b.meaning_vi?.length || 0), (b.target_en?.length || 0), (b.target_zh?.length || 0));
      return lenB - lenA;
    });

    sortedVocab.forEach(item => {
      // Kiểm tra enable (hỗ trợ cả kiểu boolean và string từ Google Sheets)
      if (String(item.enabled).toLowerCase() !== 'true') return;
      
      const vi = item.meaning_vi ? String(item.meaning_vi).trim() : '';
      const en = item.target_en ? String(item.target_en).trim() : '';
      const zh = item.target_zh ? String(item.target_zh).trim() : '';

      // Chuẩn hóa từ khóa để so khớp (không CJK normalization)
      const viNorm = vi.toLowerCase().trim();
      const enNorm = en.toLowerCase().trim();

      let matchedSource = null;
      
      // So khớp thông minh: Kiểm tra cả 3 cột
      if (
        (zh && rawInput.includes(zh)) || 
        (enNorm && rawInputLower.includes(enNorm)) || 
        (viNorm && rawInputLower.includes(viNorm))
      ) {
        matchedSource = zh || en || vi; 
      }

      const target = item[targetKey] ? String(item[targetKey]).trim() : '';
      
      if (matchedSource && target && matchedSource.toLowerCase() !== target.toLowerCase() && !seen.has(matchedSource.toLowerCase())) {
        seen.add(matchedSource.toLowerCase());
        matches.push(`"${matchedSource}" -> "${target}"`);
      }
    });

    if (matches.length === 0) return '';

    console.log("Glossary Matches Found:", matches);

    return `\n<glossary_rules>\nCRITICAL INSTRUCTION: You MUST use the following exact translations. DO NOT use any other translation or synonym for these terms.\n${matches.join('\n')}\n</glossary_rules>`;
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