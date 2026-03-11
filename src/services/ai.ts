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

  private buildGlossaryPrompt(vocab: VocabItem[]): string {
    const enabled = vocab.filter(v => v.enabled);
    if (enabled.length === 0) return '';

    return `
ENFORCE GLOSSARY MAPPINGS:
${enabled.map(v => `- "${v.term}" -> EN: "${v.targetEn}", ZH: "${v.targetZh}"`).join('\n')}
If any of these terms appear in the source text, you MUST use the provided translations.
`;
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string) {
    const glossaryPrompt = this.buildGlossaryPrompt(vocab);
    const systemPrompt = `You are a professional translator. Translate the following content to ${targetLang}. 
Keep the tone natural but professional. 
${glossaryPrompt}
Output ONLY the translated text. Do not include any explanations or JSON.`;

    const content: any[] = [{ type: 'text', text }];
    if (image) {
      content.push({
        type: 'image_url',
        image_url: { url: image }
      });
    }

    const result = await this.generate({
      system: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ]
    });

    return result.text;
  }

  async extractStructuredSummary(text: string, sourceLang: string, contextSource: 'original' | 'translated'): Promise<any> {
    const systemPrompt = `You are an expert data analyst. Extract a structured summary from the provided message context.
Output MUST be a valid JSON object matching this schema:
{
  "people_and_roles": [{"name": "...", "role_title": "...", "honorific": "...", "organization": "...", "confidence": 0-1}],
  "production_data": [{"item": "...", "metric": "...", "value": "...", "unit": "...", "timeframe": "...", "confidence": 0-1}],
  "metrics_highlights": ["..."],
  "discipline_and_ownership": [{"discipline": "...", "owner": "...", "responsibility": "...", "confidence": 0-1}],
  "requests_and_directions": [{"type": "request|instruction|direction|decision_needed|escalation", "content": "...", "priority": "P0|P1|P2", "due": "...", "blocking": true|false, "confidence": 0-1}],
  "risks_gaps_questions": [{"gap": "...", "question": "...", "priority": "P0|P1|P2"}],
  "short_summary": {"bullets": ["..."], "items_to_respond": ["..."]}
}

RULES:
1. Do not invent facts. Use "unknown" if missing.
2. Confidence is a number from 0 to 1.
3. Priority is P0 (Critical), P1 (High), or P2 (Normal).
4. Output ONLY the raw JSON. No markdown blocks.`;

    const result = await this.generate({
      system: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      responseMimeType: 'application/json'
    });

    try {
      let jsonText = result.text.trim();
      // Remove markdown code blocks if present
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
      console.error('Failed to parse extraction JSON:', err);
      // Attempt repair call
      return this.repairJson(result.text, systemPrompt);
    }
  }

  private async repairJson(badJson: string, originalSystemPrompt: string): Promise<any> {
    const repairPrompt = `The following text was supposed to be a JSON object but is invalid or contains extra text. 
Please reformat it into a STRICT valid JSON object matching the requested schema. 
Output ONLY the raw JSON.

TEXT TO REPAIR:
${badJson}`;

    const result = await this.generate({
      system: originalSystemPrompt,
      messages: [
        { role: 'system', content: originalSystemPrompt },
        { role: 'user', content: repairPrompt }
      ],
      responseMimeType: 'application/json'
    });

    try {
      let jsonText = result.text.trim();
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
    const glossaryPrompt = this.buildGlossaryPrompt(vocab);
    
    // Truncation strategy: keep first 6,000 chars and last 2,000 chars
    let truncatedContext = contextText;
    if (contextText.length > 8000) {
      truncatedContext = contextText.substring(0, 6000) + 
        '\n\n[...content truncated for brevity...]\n\n' + 
        contextText.substring(contextText.length - 2000);
    }

    let summaryPrompt = '';
    if (structuredSummary) {
      summaryPrompt = `
STRUCTURED CONTEXT INTELLIGENCE (EPE):
${JSON.stringify(structuredSummary, null, 2)}

MANDATORY GUIDELINES:
1. Use titles/honorifics exactly as extracted in people_and_roles.
2. Highlight P0/P1 requests and key metrics in the reply.
3. Do not change numbers/units/dates from production_data.
4. If role/title confidence < 0.6, use neutral phrasing and ask for clarification.
5. If Audience is "Taiwan-Manager", use appropriate Traditional Chinese honorific style (e.g., 經理, 主任, 您).
`;
    }

    const systemPrompt = `You are an expert communicator. You are replying to the message provided in the CONTEXT.
Generate a reply based on the following parameters:
- Audience: ${params.audience}
- Tone: ${params.tone}
- Target Language: ${params.lang}
- Format: ${params.format}

${glossaryPrompt}
${summaryPrompt}

INSTRUCTIONS:
1. You are replying to the message below.
2. Do NOT invent missing facts.
3. If essential details are missing, ask 2–3 clarifying questions in the reply OR include a short ‘Need confirmation’ section (depends on Reply Format).
4. Output ONLY the generated reply as plain text. 
5. If the format is "Email", start with "Subject: [Subject Line]" followed by the body.
6. Otherwise, output the message body directly.
7. Do not output JSON or any metadata.`;

    const userPrompt = `
CONTEXT (Message you are replying to):
---
${truncatedContext}
---

REPLY REQUIREMENTS (User Intent):
---
${requirements}
---
`;

    const result = await this.generate({
      system: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    return result.text;
  }

  async summarize(text: string) {
    const systemPrompt = `Summarize the following content in Vietnamese.
Output exactly:
- Max 7 bullet points for summary.
- Max 5 items to respond to.
- Optional Risks/Gaps section.
Output as plain text with clear headings. No JSON.`;

    const result = await this.generate({
      system: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ]
    });

    return result.text;
  }

  async analyzeFileContent(text: string, language: string = 'Vietnamese') {
    const systemPrompt = `Bạn là hệ thống trích xuất ngữ cảnh chuyên nghiệp. Hãy đọc tài liệu sau và trả về một bản "Context Summary" (Tóm tắt ngữ cảnh) ngắn gọn, súc tích.
Bản tóm tắt phải gồm 3 phần rõ ràng:
1. **Thông tin cốt lõi**: Ý chính của tài liệu là gì?
2. **Yêu cầu của người gửi**: Người gửi muốn gì?
3. **Các hành động cần phản hồi**: Các điểm cần phản hồi lại là gì?

Tuyệt đối KHÔNG sinh ra câu trả lời cuối cùng. KHÔNG phân tích dài dòng thừa thãi. Trình bày bằng Markdown.
IMPORTANT: You must write the entire output strictly in ${language}.`;

    const result = await this.generate({
      system: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ]
    });

    return result.text;
  }
}
