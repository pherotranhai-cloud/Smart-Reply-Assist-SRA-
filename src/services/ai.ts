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

  private buildGlossaryPrompt(vocab: VocabItem[], targetLang: string, sourceText?: string): string {
    if (!sourceText) return '';
    
    const langLower = targetLang.toLowerCase();
    let targetKey: 'meaning_vi' | 'target_en' | 'target_zh';
    
    if (langLower.includes('vi') || langLower.includes('vietnamese')) {
      targetKey = 'meaning_vi';
    } else if (langLower.includes('en') || langLower.includes('english')) {
      targetKey = 'target_en';
    } else if (langLower.includes('zh') || langLower.includes('chinese')) {
      targetKey = 'target_zh';
    } else {
      return ''; // Unsupported target language for glossary
    }

    const lowerText = sourceText.toLowerCase();
    const mappings: string[] = [];

    vocab.forEach(v => {
      const isEnabled = v.enabled === true || v.enabled === 'true';
      if (!isEnabled) return;

      const targetValue = v[targetKey];
      if (!targetValue || typeof targetValue !== 'string') return;

      // Check all three columns for matches in source text
      const candidates = [
        { value: v.meaning_vi },
        { value: v.target_en },
        { value: v.target_zh }
      ];

      candidates.forEach(cand => {
        if (!cand.value || typeof cand.value !== 'string') return;
        
        if (lowerText.includes(cand.value.toLowerCase())) {
          // Prevent self-mapping
          if (cand.value.toLowerCase() !== targetValue.toLowerCase()) {
            mappings.push(`- "${cand.value}" -> "${targetValue}"`);
          }
        }
      });
    });

    if (mappings.length === 0) return '';

    // De-duplicate mappings
    const uniqueMappings = Array.from(new Set(mappings));

    return `
IMPORTANT: You must use the following glossary for specific terms. Do not translate them differently:
${uniqueMappings.join('\n')}
`;
  }

  async translate(text: string, targetLang: string, vocab: VocabItem[], image?: string) {
    const glossaryPrompt = this.buildGlossaryPrompt(vocab, targetLang, text);
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
    const hasContext = contextText && contextText.trim().length > 0;
    const glossaryPrompt = this.buildGlossaryPrompt(vocab, params.lang, hasContext ? contextText : undefined);
    
    // Truncation strategy: keep first 6,000 chars and last 2,000 chars
    let truncatedContext = contextText;
    if (hasContext && contextText.length > 8000) {
      truncatedContext = contextText.substring(0, 6000) + 
        '\n\n[...content truncated for brevity...]\n\n' + 
        contextText.substring(contextText.length - 2000);
    }

    let summaryPrompt = '';
    if (hasContext && structuredSummary) {
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

    const systemPrompt = `You are an expert communicator. ${hasContext ? 'You are replying to the message provided in the CONTEXT.' : 'You are drafting a new message based on the provided requirements.'}
Generate a message based on the following parameters:
- Audience: ${params.audience}
- Tone: ${params.tone}
- Target Language: ${params.lang}
- Format: ${params.format}

${glossaryPrompt}
${summaryPrompt}

INSTRUCTIONS:
1. ${hasContext ? 'You are replying to the message below.' : 'Draft a new message based entirely on the requirements provided.'}
2. Do NOT invent missing facts.
3. If essential details are missing, ask 2–3 clarifying questions in the message OR include a short ‘Need confirmation’ section (depends on Format).
4. Output ONLY the generated message as plain text. 
5. If the format is "Email", start with "Subject: [Subject Line]" followed by the body.
6. Otherwise, output the message body directly.
7. Do not output JSON or any metadata.`;

    const userPrompt = hasContext ? `
CONTEXT (Message you are replying to):
---
${truncatedContext}
---

REPLY REQUIREMENTS (User Intent):
---
${requirements}
---
` : `
DRAFT REQUIREMENTS (User Intent):
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
