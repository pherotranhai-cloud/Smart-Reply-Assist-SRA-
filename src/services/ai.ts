import { AISettings, VocabItem } from '../types';
import { GenerateParams, AIProvider } from './providers';
import { GeminiProvider } from './geminiProvider';
import { OpenAIProvider } from './openaiProvider';

export class AIService {
  private settings: AISettings;
  private provider: AIProvider;

  constructor(settings: AISettings) {
    this.settings = settings;
    if (settings.activeProvider === 'openai') {
      this.provider = new OpenAIProvider(settings.openai);
    } else {
      this.provider = new GeminiProvider(settings.gemini);
    }
  }

  private async generate(params: GenerateParams): Promise<{ text: string }> {
    return this.provider.generate(params);
  }

  async testConnection() {
    try {
      const models = await this.provider.listModels();
      return models.length > 0;
    } catch (err) {
      console.error('Connection test failed:', err);
      return false;
    }
  }

  private async executeAI(system: string, user: string | any[], responseMimeType?: 'application/json' | 'text/plain', stream?: boolean, onChunk?: (chunk: string) => void): Promise<string> {
    const result = await this.generate({
      system: system.trim(),
      messages: [
        { role: 'system', content: system.trim() },
        { role: 'user', content: typeof user === 'string' ? user.trim() : user }
      ],
      responseMimeType,
      stream,
      onChunk
    });
    return result.text;
  }

  private buildGlossaryPrompt(vocab: VocabItem[], targetLang: string, sourceText?: string): string {
    if (!sourceText) return '';
    
    // Normalize source text for robust matching (remove punctuation, extra spaces)
    const normalizedInput = sourceText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s{2,}/g, " ").trim();
    
    let targetKey: 'meaning_vi' | 'target_en' | 'target_zh' = 'target_en'; 
    const targetLangLower = targetLang.toLowerCase();
    if (targetLangLower.includes('vi')) targetKey = 'meaning_vi';
    else if (targetLangLower.includes('zh') || targetLangLower.includes('chinese')) targetKey = 'target_zh';

    const matches: string[] = [];
    const seen = new Set<string>();

    vocab.forEach(item => {
      if (String(item.enabled).toLowerCase() !== 'true') return;
      
      const vi = item.meaning_vi ? String(item.meaning_vi).trim() : '';
      const en = item.target_en ? String(item.target_en).trim() : '';
      const zh = item.target_zh ? String(item.target_zh).trim() : '';

      // Create normalized versions for matching
      const viNorm = vi.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s{2,}/g, " ").trim();
      const enNorm = en.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s{2,}/g, " ").trim();
      const zhNorm = zh.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s{2,}/g, " ").trim();

      let matchedSource = null;
      
      // Check if any of the terms exist in the normalized input
      if (zhNorm && normalizedInput.includes(zhNorm)) matchedSource = zh;
      else if (enNorm && normalizedInput.includes(enNorm)) matchedSource = en;
      else if (viNorm && normalizedInput.includes(viNorm)) matchedSource = vi;

      const target = item[targetKey] ? String(item[targetKey]).trim() : '';
      
      if (matchedSource && target && matchedSource.toLowerCase() !== target.toLowerCase() && !seen.has(matchedSource.toLowerCase())) {
        seen.add(matchedSource.toLowerCase());
        matches.push(`"${matchedSource}" -> "${target}"`);
      }
    });

    if (matches.length === 0) return '';

    return `\n<glossary_rules>\nCRITICAL INSTRUCTION: You MUST use the following exact translations. DO NOT use any other translation or synonym for these terms.\n${matches.join('\n')}\n</glossary_rules>`;
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string, onChunk?: (chunk: string) => void) {
    const glossary = this.buildGlossaryPrompt(vocab, targetLang, text);
    const persona = `You are an expert ${targetLang.toUpperCase()} Industry Translator.`;
    
    const systemPrompt = `${persona}\nYour task is to translate the user's input into ${targetLang}.\nOutput ONLY the translated text. Do not include any explanations or conversational filler.${glossary}`;

    const content: any[] = [{ type: 'text', text: text.trim() }];
    if (image) {
      content.push({ type: 'image_url', image_url: { url: image } });
    }

    return this.executeAI(systemPrompt, content, undefined, !!onChunk, onChunk);
  }

  async extractStructuredSummary(text: string, sourceLang: string, contextSource: 'original' | 'translated'): Promise<any> {
    const systemPrompt = `Expert analyst. Extract JSON:
{
  "people_and_roles": [{"name": "...", "role_title": "...", "honorific": "...", "organization": "...", "confidence": 0-1}],
  "production_data": [{"item": "...", "metric": "...", "value": "...", "unit": "...", "timeframe": "...", "confidence": 0-1}],
  "metrics_highlights": ["..."],
  "discipline_and_ownership": [{"discipline": "...", "owner": "...", "responsibility": "...", "confidence": 0-1}],
  "requests_and_directions": [{"type": "request|instruction|direction|decision_needed|escalation", "content": "...", "priority": "P0|P1|P2", "due": "...", "blocking": true|false, "confidence": 0-1}],
  "risks_gaps_questions": [{"gap": "...", "question": "...", "priority": "P0|P1|P2"}],
  "short_summary": {"bullets": ["..."], "items_to_respond": ["..."]}
}
Rules: No markdown. Valid JSON only. Use "unknown" if missing.`;

    const resultText = await this.executeAI(systemPrompt, text, 'application/json');

    try {
      let jsonText = resultText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      const parsed = JSON.parse(jsonText);
      return {
        ...parsed,
        meta: {
          sourceLanguage: sourceLang,
          contextSource,
          extractedAtIso: new Date().toISOString()
        }
      };
    } catch (err) {
      return this.repairJson(resultText, systemPrompt);
    }
  }

  private async repairJson(badJson: string, originalSystemPrompt: string): Promise<any> {
    const repairPrompt = `Reformat to STRICT valid JSON. Output ONLY raw JSON:\n${badJson}`;
    const resultText = await this.executeAI(originalSystemPrompt, repairPrompt, 'application/json');

    try {
      let jsonText = resultText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      return JSON.parse(jsonText);
    } catch (err) {
      throw new Error('JSON repair failed');
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
    const hasContext = contextText && contextText.trim().length > 0;
    const glossary = this.buildGlossaryPrompt(vocab, params.lang, hasContext ? contextText : requirements);
    
    let truncatedContext = contextText.trim();
    if (hasContext && truncatedContext.length > 8000) {
      truncatedContext = truncatedContext.substring(0, 6000) + 
        '\n[...truncated...]\n' + 
        truncatedContext.substring(truncatedContext.length - 2000);
    }

    let summaryPrompt = '';
    if (hasContext && structuredSummary) {
      summaryPrompt = `\n<context_intel>\n${JSON.stringify(structuredSummary)}\nUse titles/honorifics from people_and_roles. Highlight P0/P1 items.\n</context_intel>`;
    }

    const systemPrompt = `You are a professional factory manager communicating clearly and directly. No corporate fluff.

<critical_requirements>
- Target Audience: ${params.audience}
- Tone: ${params.tone}
- Output Language: ${params.lang}
- Format: ${params.format}
- Output ONLY the message body (if Email, include Subject line first).
- Max 200 words. No filler.
</critical_requirements>${summaryPrompt}${glossary}`;

    const userPrompt = hasContext ? `Context: ${truncatedContext}\nIntent: ${requirements}` : `Intent: ${requirements}`;

    return this.executeAI(systemPrompt, userPrompt, undefined, !!onChunk, onChunk);
  }

  async summarize(text: string) {
    const systemPrompt = `Summarize in Vietnamese. Heading: Tóm tắt (max 7 bullets), Cần phản hồi (max 5 items), Rủi ro (optional). Plain text.`;
    return this.executeAI(systemPrompt, text);
  }

  async analyzeFileContent(text: string, language: string = 'Vietnamese') {
    const systemPrompt = `Trích xuất ngữ cảnh tài liệu (${language}). Markdown headings: Thông tin cốt lõi, Yêu cầu người gửi, Hành động cần phản hồi. Không sinh câu trả lời cuối.`;
    return this.executeAI(systemPrompt, text);
  }
}
