import { AISettings, VocabItem } from '../types';
import { GenerateParams } from './providers';
import { aiTransport } from '../runtime/aiTransport';

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  private async generate(params: GenerateParams): Promise<{ text: string }> {
    return aiTransport.call('GENERATE', this.settings, params);
  }

  async testConnection() {
    try {
      const response = await aiTransport.call('LIST_MODELS', this.settings);
      return !!response.models;
    } catch (err) {
      console.error('Connection test failed:', err);
      return false;
    }
  }

  private async executeAI(system: string, user: string | any[], responseMimeType?: 'application/json' | 'text/plain'): Promise<string> {
    const result = await this.generate({
      system: system.trim(),
      messages: [
        { role: 'system', content: system.trim() },
        { role: 'user', content: typeof user === 'string' ? user.trim() : user }
      ],
      responseMimeType
    });
    return result.text;
  }

  private buildGlossaryPrompt(vocab: VocabItem[], targetLang: string, sourceText?: string): string {
    if (!sourceText) return '';
    const lowerInput = sourceText.toLowerCase().trim();
    let targetKey: 'meaning_vi' | 'target_en' | 'target_zh' = 'target_en'; 
    const targetLangLower = targetLang.toLowerCase();
    if (targetLangLower.includes('vi')) targetKey = 'meaning_vi';
    else if (targetLangLower.includes('zh')) targetKey = 'target_zh';

    const matches: string[] = [];
    const seen = new Set<string>();

    vocab.forEach(item => {
      if (String(item.enabled).toLowerCase() !== 'true') return;
      const vi = item.meaning_vi ? String(item.meaning_vi).toLowerCase().trim() : '';
      const en = item.target_en ? String(item.target_en).toLowerCase().trim() : '';
      const zh = item.target_zh ? String(item.target_zh).toLowerCase().trim() : '';

      let matched = null;
      if (zh && lowerInput.includes(zh)) matched = String(item.target_zh).trim();
      else if (en && lowerInput.includes(en)) matched = String(item.target_en).trim();
      else if (vi && lowerInput.includes(vi)) matched = String(item.meaning_vi).trim();

      const target = item[targetKey] ? String(item[targetKey]).trim() : '';
      if (matched && target && matched.toLowerCase() !== target.toLowerCase() && !seen.has(matched.toLowerCase())) {
        seen.add(matched.toLowerCase());
        matches.push(`"${matched}"->"${target}"`);
      }
    });

    return matches.length > 0 ? `\nStrictly use glossary: ${matches.join(', ')}.` : '';
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string) {
    const glossary = this.buildGlossaryPrompt(vocab, targetLang, text);
    const persona = `Act as a ${targetLang.toUpperCase()} Industry Translator.`;
    const systemPrompt = `${persona} Strictly use glossary. Output ONLY translated text.${glossary}`;

    const content: any[] = [{ type: 'text', text: text.trim() }];
    if (image) {
      content.push({ type: 'image_url', image_url: { url: image } });
    }

    return this.executeAI(systemPrompt, content);
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
    structuredSummary?: any
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
      summaryPrompt = `Context Intel: ${JSON.stringify(structuredSummary)}. Use titles/honorifics from people_and_roles. Highlight P0/P1.`;
    }

    const systemPrompt = `Speak like a professional factory manager: Concise, clear, direct. No corporate fluff.
Params: Audience: ${params.audience}, Tone: ${params.tone}, Lang: ${params.lang}, Format: ${params.format}.
${glossary}
${summaryPrompt}
Instructions: Output ONLY message body (Email includes Subject). Max 200 words. No filler.`;

    const userPrompt = hasContext ? `Context: ${truncatedContext}\nIntent: ${requirements}` : `Intent: ${requirements}`;

    return this.executeAI(systemPrompt, userPrompt);
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
