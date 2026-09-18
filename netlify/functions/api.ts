import express, { Router } from 'express';
import serverless from 'serverless-http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';
import Papa from 'papaparse';
import OpenAI from 'openai';
import {
  createSupabaseClient,
  countTotalRequests,
  fetchRecentResponses
} from '../../shared/adminService';
import { requireAdmin, warnIfAdminAuthUnconfigured } from '../../shared/adminAuth';
import { countOnline, recordHeartbeat } from '../../shared/presence';
import { normalizeHeader, extractVocabRow, vocabHashKey, hasSourcePhrase } from '../../shared/vocabNormalize';
import { APP_ENGINE_ID, tuningFor, createChatCompletion } from '../../shared/modelConfig';

dotenv.config();

warnIfAdminAuthUnconfigured('netlify/functions/api.ts');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

const supabase = createSupabaseClient();

const logToSupabase = async (payload: any) => {
  if (!supabase) return;
  try {
    const insertPayload = {
      ...payload,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('app_logs').insert([insertPayload] as any);
    if (error) {
      console.error('Supabase logging error:', error);
      // Self-healing: if ip_address column does not exist in app_logs table, retry without it
      if (error.message && error.message.includes('ip_address') && 'ip_address' in insertPayload) {
        console.log('Retrying Supabase insert without ip_address...');
        const { ip_address, ...fallbackPayload } = insertPayload;
        const { error: retryError } = await supabase.from('app_logs').insert([fallbackPayload] as any);
        if (retryError) {
          console.error('Supabase logging retry error:', retryError);
        }
      }
    }
  } catch (err) {
    console.error('Supabase logging exception:', err);
  }
};

// Built lazily rather than at module load: `new OpenAI({apiKey: undefined})`
// throws immediately, which used to take the whole cold start down with it
// (every route — /health, /admin/*, /import-vocab, not just the OpenAI-backed
// ones, which already guard on OPENAI_API_KEY before touching this client).
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  return openaiClient;
}

const app = express();
export const router = Router();

app.use(cors());
app.use(express.json({ limit: '10mb' }));


router.get('/health', (req, res) => res.json({ status: 'ok' }));

/**
 * Loose language name/code -> canonical display name + script-enforcement
 * sentence. Used by both /compose and /translate below (/compose used to
 * have this exact mapping as its own local `mappedLang` / `scriptRule`
 * variables, with no case for Indonesian, Burmese or Vietnamese at all —
 * a second copy /translate would otherwise have had to invent independently,
 * and did originally, which is how the two ended up enforcing scripts for
 * different subsets of LANGUAGES). Unifying them means /compose also starts
 * getting Vietnamese diacritics and real Indonesian/Burmese enforcement
 * (previously just a parenthetical in the display name, not an instruction)
 * it did not have before.
 */
function resolveLanguage(lang: string): { mappedLang: string; scriptRule: string } {
  switch (lang) {
    case 'Chinese (Simplified)':
    case 'zh-CN':
      return { mappedLang: 'Chinese (Simplified Hanzi)', scriptRule: 'MUST use Simplified Chinese characters (简体中文), never Traditional.' };
    case 'Chinese (Traditional)':
    case 'zh-TW':
      return { mappedLang: 'Chinese (Traditional)', scriptRule: 'Ensure all output characters are strictly Traditional Chinese (繁體中文), never Simplified.' };
    case 'Indonesian':
    case 'id':
      return { mappedLang: 'Indonesian (Bahasa Indonesia)', scriptRule: 'Write in standard Bahasa Indonesia spelling and grammar.' };
    case 'Burmese':
    case 'my':
      return { mappedLang: 'Burmese (Myanmar Unicode)', scriptRule: 'Output MUST be Myanmar Unicode script (မြန်မာ), never Zawgyi encoding.' };
    case 'Vietnamese':
    case 'vi':
      return { mappedLang: 'Vietnamese', scriptRule: 'Use fully accented Vietnamese diacritics (dấu) on every syllable that takes one — never drop them.' };
    default:
      return { mappedLang: lang, scriptRule: '' };
  }
}

/** resolveLanguage's canonical name, for looking up a language-keyed table (e.g. SUMMARY_LABELS) by loose input. */
function canonicalLangName(lang: string): string {
  const aliases: Record<string, string> = {
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    id: 'Indonesian',
    my: 'Burmese',
    vi: 'Vietnamese',
    en: 'English',
  };
  return aliases[lang] ?? lang;
}

/**
 * Summary-mode's fixed Markdown section labels, one pair per LANGUAGES entry
 * (src/constants.ts). Previously hardcoded in Vietnamese regardless of
 * target language; kept in a lookup table (rather than left to the model to
 * translate) so the heading text is deterministic for every language we
 * already know about.
 */
const SUMMARY_LABELS: Record<string, { overview: string; keyTakeaways: string }> = {
  'Vietnamese': { overview: 'Nội dung chính / Tổng quan', keyTakeaways: 'Ý chính cần nắm' },
  'English': { overview: 'Overview', keyTakeaways: 'Key Takeaways' },
  'Chinese (Simplified)': { overview: '主要内容 / 概述', keyTakeaways: '重点摘要' },
  'Chinese (Traditional)': { overview: '主要內容 / 概述', keyTakeaways: '重點摘要' },
  'Indonesian': { overview: 'Isi Utama / Ringkasan', keyTakeaways: 'Poin Penting' },
  'Burmese': { overview: 'အဓိက အကြောင်းအရာ', keyTakeaways: 'မှတ်သားရန် အချက်များ' },
};

/**
 * The summary-mode output contract. `targetLang` is the raw (non-Auto)
 * request value; pass undefined for the Auto case, where the target language
 * is not known until the model itself picks one (see buildTranslateSystemPrompt).
 */
function buildSummaryInstruction(targetLang?: string): string {
  if (!targetLang) {
    return `You MUST NOT output the full translation. Instead, output ONLY a structured summary, written in whichever language you determined per the TARGET LANGUAGE rule above, using this exact Markdown shape (write the bracketed labels in that same language; keep the emoji, bold markers and bullet structure unchanged):

### 📋 [Brief Summary Title]
**[Overview label]:**
[A short 2-3 sentence paragraph summarizing the context]

**📌 [Key Takeaways label]:**
- *[Key Point 1]*: Detailed description of the action or key information.
- *[Key Point 2]*: Next action, timing, or affected entity.
- *[Key Point 3]*: (If applicable) Important notes or warnings from the original text.`;
  }

  const labels = SUMMARY_LABELS[canonicalLangName(targetLang)] ?? SUMMARY_LABELS['English'];
  return `You MUST NOT output the full translation. Instead, output ONLY a structured summary in ${targetLang} using the following Markdown format exactly:

### 📋 [Brief Summary Title]
**${labels.overview}:**
[A short 2-3 sentence paragraph summarizing the context]

**📌 ${labels.keyTakeaways}:**
- *[Key Point 1]*: Detailed description of the action or key information.
- *[Key Point 2]*: Next action, timing, or affected entity.
- *[Key Point 3]*: (If applicable) Important notes or warnings from the original text.`;
}

export interface TranslatePromptInput {
  targetLang?: string | null;
  /** The client's pre-built `[{term, translation}]` JSON string, or '' / undefined for none — see src/services/glossary.ts. */
  glossary?: string | null;
  summarize?: boolean;
}

/**
 * Builds /translate's system prompt. Pure and exported so the language x
 * glossary x summarize matrix can be exercised without booting an OpenAI
 * client or an HTTP request (OPENAI_API_KEY is not available in every
 * environment this runs in — see repo memory.md §6).
 *
 * 'Auto' (LANGUAGES in src/constants.ts) is handled entirely in the prompt,
 * not resolved to a concrete language here: matchGlossary(text, vocab,
 * 'Auto') already returns [] on the client (src/services/glossary.ts) since
 * there is no glossary column to pin an unpinned target to, so `glossary` is
 * always '' for an Auto request by the time it reaches this function. No
 * server-side prompt change can recover glossary injection for Auto — that
 * would need the client to resolve a concrete target before matching, which
 * is outside this unit's scope (frontend/glossary matcher are unit 1/2's).
 */
export function buildTranslateSystemPrompt({ targetLang, glossary, summarize }: TranslatePromptInput): string {
  const isAuto = !targetLang || targetLang === 'Auto';

  const targetSection = isAuto
    ? `TARGET LANGUAGE: not pinned by the caller ("Auto"). Detect the dominant language of the SOURCE text yourself, then:
- If the source is Vietnamese, translate into English.
- If the source is anything other than Vietnamese, translate into Vietnamese.
Do not narrate or explain this detection step — output only the translation, in whichever language you determined, using that language's correct script (full Vietnamese diacritics, or the correct Hanzi variant for Chinese).`
    : (() => {
        const { mappedLang, scriptRule } = resolveLanguage(targetLang as string);
        return `TARGET LANGUAGE: Translate to ${mappedLang} with 100% technical accuracy.${scriptRule ? `\n${scriptRule}` : ''}`;
      })();

  const glossaryText = (glossary ?? '').trim();
  const hasGlossary = glossaryText.length > 0 && glossaryText !== '[]';
  const glossarySection = hasGlossary
    ? `\n\nGLOSSARY — mandatory term overrides (JSON array of {term, translation} pairs matched against the source text):
${glossaryText}
These translations are REQUIRED and override your own default wording. A \`term\` still applies when it appears inflected, pluralised, capitalised differently, or embedded inside a longer compound word/phrase in the source — recognise it in any of those forms and substitute the paired \`translation\` verbatim. Do not use a synonym, and do not skip a term just because its surface form in the text does not match the glossary entry exactly.`
    : '';

  const outputContract = summarize
    ? buildSummaryInstruction(isAuto ? undefined : (targetLang as string))
    : 'OUTPUT CONTRACT: Return ONLY the translated text. No preamble, no explanation, no labels, and no markdown code fences — just the translation, ready to paste as-is.';

  return `ROLE: You are an expert factory-floor interpreter translating shop-floor communication (production orders, QA notes, line instructions, safety alerts) between managers, QA and line workers. Maintain the source's tone exactly — a strict or urgent instruction must stay strict or urgent, never softened into a polite suggestion.

${targetSection}

RULES (in order; each governs its own, non-overlapping category of the text):
1. Model numbers, part/product codes and brand names (e.g. "EVA-220X", "Nike", "PU-8850") are copied exactly as written — never translated, never transliterated.
2. Numeric measurements and units (mm, kg, %, pairs, pcs, °C, timestamps) are copied exactly as written; only the quantifier words around them ("khoảng", "approximately", "ít nhất", "at least") are translated.
3. "@name" mentions are copied exactly as written, never translated or transliterated. A job title or role near a mention (e.g. "Line Leader", "QA Supervisor") IS translated — use the glossary's entry for it when one exists.
4. Any term matching a GLOSSARY entry below is mandatory-overridden by that entry's translation (see GLOSSARY for the full contract, including inflected/plural/compound forms).
5. Everything else translates normally, with full technical accuracy and no paraphrasing that would change the instruction's meaning.${glossarySection}

${outputContract}`;
}

router.post('/translate', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { text, targetLang, glossary, image, summarize } = req.body;
  try {
    const systemPrompt = buildTranslateSystemPrompt({ targetLang, glossary, summarize });

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // 2. Build a single unified user content array
    const userContent: any[] = [];

    const hasText = text && text.trim() !== '';

    if (hasText) {
      userContent.push({ type: 'text', text: text });
    }

    if (image) {
      // 3. Robust Vision Instruction
      const imageInstruction = hasText 
        ? "\n\n[IMAGE INSTRUCTION]: Additionally, extract and translate any text found in the attached image. Preserve the original layout, tables, and line breaks. You MUST apply the Glossary and Rules to the extracted text."
        : "[IMAGE INSTRUCTION]: Extract and translate all visible text in this image. Preserve the original layout, bullet points, and line breaks. Strictly follow the System Rules and Glossary above for the translation.";
      
      userContent.push({ type: 'text', text: imageInstruction });
      userContent.push({ type: 'image_url', image_url: { url: image } });
    }

    // 4. Push the unified content as a single user message
    messages.push({ role: 'user', content: userContent });

    const targetModel = req.body.model || APP_ENGINE_ID;

    const stream = await createChatCompletion(
      getOpenAI(),
      { model: targetModel, messages, stream: true },
      tuningFor(targetModel, 'translate')
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let outputText = '';
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        outputText += content;
        res.write(content);
      }
    }
    res.end();

    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'translate',
      input_text: text || '[Image only]',
      output_text: outputText,
      from_lang: 'auto',
      to_lang: targetLang,
      ip_address: (req as any).clientIp
    });
  } catch (error: any) {
    console.error('Translation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Translation failed', details: error.message });
  }
});

router.post('/log', async (req, res) => {
  const { task_type, input_text, output_text, from_lang, to_lang } = req.body;
  logToSupabase({
    task_type,
    input_text,
    output_text,
    from_lang,
    to_lang,
    ip_address: (req as any).clientIp
  });
  res.json({ success: true });
});

router.post('/ocr', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  try {
    const systemPrompt = "Bạn là một máy nhận diện ký tự quang học siêu tốc. Hãy bóc tách chính xác toàn bộ văn bản có trong hình ảnh này thành chuỗi ký tự thô. Tuyệt đối không mô tả ảnh, không giải thích ngữ cảnh, trả về duy nhất chữ tìm được để tối ưu hóa Latency tối đa.";

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
          { type: 'image_url', image_url: { url: image } }
        ]
      }
    ];

    const targetModel = req.body.model || APP_ENGINE_ID;
    const response = await createChatCompletion(
      getOpenAI(),
      { model: targetModel, messages },
      tuningFor(targetModel, 'ocr')
    );

    res.json({ extractedText: response.choices[0].message.content });
  } catch (error: any) {
    console.error('OCR error:', error.response?.data || error.message);
    res.status(500).json({ error: 'OCR extraction failed', details: error.message });
  }
});

router.post('/talk', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: "Missing text or targetLang" });
  }

  try {
    const systemPrompt = `# ROLE: Direct_Interpreter
# LOGIC: Translate [Input] to [Target_Lang] instantly.
# RULES: 
- Keep names/codes as-is.
- Use natural/spoken factory tone.
- NO explanations. NO intro. 0% Filler.
- Format: Plain_String only.
- Target Lang: ${targetLang}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const targetModel = req.body.model || APP_ENGINE_ID;
    const stream = await createChatCompletion(
      getOpenAI(),
      {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        stream: true,
      },
      tuningFor(targetModel, 'talk')
    );

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        // Mock SSE format
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error: any) {
    console.error('Talk error:', error.message);
    res.status(500).json({ error: 'Talk failed', details: error.message });
  }
});

router.post('/compose', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { contextText, requirements, params, glossary } = req.body;
  try {
    // Same resolveLanguage() /translate uses below, rather than a second copy
    // of this if-chain: this route used to have its own, and it disagreed
    // with /translate's about which languages got script enforcement at all
    // (Indonesian, Burmese and Vietnamese got none here).
    const { mappedLang, scriptRule } = resolveLanguage(params.lang);

    const scriptEnforcement = scriptRule ? `\n  SCRIPT_ENFORCEMENT: ${scriptRule}` : '';

    let structureInstruction = '';
    const formatStr = (params.format || '').toLowerCase();
    const goalStr = (params.goal || '').toLowerCase();

    if (formatStr.includes('email')) {
      structureInstruction = `
<structure_instruction>
  You MUST format the output as a Formal Email using Markdown. DO NOT wrap the output in \`\`\`markdown ... \`\`\` code blocks:
  1. Subject Line: Must start with a clear, bolded subject line (e.g., **Subject:** [Concise, professional title in Target Language]).
  2. Salutation: Include a formal opening greeting appropriate for the audience (e.g., Supervisor, Partner, Board of Directors).
  3. Body paragraphs: Separate ideas clearly with line breaks. Use bold text (**...**) for key information (metrics, deadlines, item codes) and bullet points (- ) for specific actions/SOPs.
  4. Sign-off: Conclude with a professional closing and sign-off (e.g., Best regards, / 祝好, / Trân trọng,).
</structure_instruction>`;
    } else if (goalStr.includes('explain') || goalStr.includes('guide') || formatStr.includes('action_list') || goalStr.includes('technical')) {
      structureInstruction = `
<structure_instruction>
  You MUST format the output as a Technical Guide/Explanation using Markdown. DO NOT wrap the output in \`\`\`markdown ... \`\`\` code blocks:
  1. Divide the layout using small headers (e.g., ### 📌 Vấn đề kỹ thuật, ### 🛠️ Giải pháp thực hiện).
  2. Use bold (**...**) for core technical specifications and metrics.
  3. Keep the layout organized and structured for factory floor scanning.
</structure_instruction>`;
    } else {
      structureInstruction = `
<structure_instruction>
  You MUST format the output as a concise Internal Message using Markdown. DO NOT wrap the output in \`\`\`markdown ... \`\`\` code blocks:
  1. Use clear line breaks for readability.
  2. Use bullet points (- ) for lists or action items.
  3. Bold (**...**) critical information such as error codes, line numbers, or Person-In-Charge (PIC) names so they can be grasped in 3 seconds.
</structure_instruction>`;
    }

    const systemPrompt = `<system_context>
  ROLE: Industrial_Proxy_Writer
  DOMAIN: Factory_Operations
  MODE: Ghostwriting (1st_person_perspective)
</system_context>

<constraints>
  STRICT_LANG: ${mappedLang} !!IMPORTANT: 0% source language leakage.
  NO_REPLY: Never respond to user. Rewrite ONLY.
  FORMAT: Clean_text_only. No explanations.${scriptEnforcement}
</constraints>

<transformation_logic>
  IF {Goal == "Remind"} -> Start: [Urgent_Hook] | End: [Action_Deadline]
  IF {Goal == "Consult"} -> Style: [Inquiry] | End: [Specific_Question_For_Feedback]
  IF {Goal == "Announce"} -> Style: [Formal_Directive] | End: [Strict_Implementation_Order]
</transformation_logic>

<parameters>
  TARGET: ${mappedLang}
  AUDIENCE: ${params.audience}
  TONE: ${params.tone}
  LENGTH: ${params.length}
  FORMAT: ${params.format}
  GOAL: ${params.goal || 'Custom'}
</parameters>

<glossary_injection>
  ${glossary || 'No specific glossary provided.'}
</glossary_injection>

<mandatory_workflow>
  STEP_1: IDENTIFY [Target_Language] (${mappedLang})
  STEP_2: TRANSLATE user_intent 100% into [Target_Language]
  STEP_3: APPLY [Goal] and [Tone] logic using ONLY [Target_Language]
  !CRITICAL: If [Target_Language] is ${mappedLang}, every single word in Output must be ${mappedLang}.
</mandatory_workflow>

<execution_flow>
  1. Detect [Input_Intent] (Context + Requirements)
  2. Follow <mandatory_workflow>
  3. Apply [Tone] & [Audience] honorifics
  4. Return Final_Message (Max 200 words. No filler.)
</execution_flow>
${structureInstruction}`;
    
    const targetModel = req.body.model || APP_ENGINE_ID;
    const response = await createChatCompletion(
      getOpenAI(),
      {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${contextText}\n${requirements}` }
        ],
      },
      tuningFor(targetModel, 'compose')
    );

    const outputText = response.choices[0].message.content;

    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'compose',
      input_text: `${contextText}\n${requirements}`,
      output_text: outputText,
      from_lang: 'auto',
      to_lang: mappedLang,
      ip_address: (req as any).clientIp
    });

    res.json({ generatedReply: outputText });
  } catch (error: any) {
    console.error('Compose error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Compose failed', details: error.message });
  }
});

router.post('/import-vocab', async (req, res) => {
  try {
    let csvData: string;
    try {
      console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;
      console.log("Fetching from URL:", sheetUrl);
      const response = await axios.get(sheetUrl, { timeout: 10000 });
      if (!response.data) {
        throw new Error('Empty response from Google Sheets');
      }
      csvData = response.data;
    } catch (sheetError: any) {
      console.warn("Failed to fetch from Google Sheets, trying local fallback:", sheetError.message);
      try {
        const localPath = path.join(process.cwd(), 'Vocabulary Library.csv');
        csvData = fs.readFileSync(localPath, 'utf-8');
        console.log("Successfully read local Vocabulary Library.csv fallback.");
      } catch (fsError: any) {
        console.error("Local CSV fallback also failed:", fsError.message);
        throw sheetError;
      }
    }

    const parsed = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader
    });

    const rawData = parsed.data;
    if (rawData.length === 0) {
      return res.json({ message: 'No data found in Google Sheet', count: 0, data: [] });
    }

    // VocabItem's shape lives in shared/vocabNormalize.ts — kept in one place
    // because it used to drift between this route and import-vocab.ts.
    const sanitizedData = (rawData as Record<string, any>[])
      .map((item) => {
        const fields = extractVocabRow(item);
        const id = crypto.createHash('md5').update(vocabHashKey(fields)).digest('hex');
        return { id, ...fields };
      })
      .filter(hasSourcePhrase);

    if (sanitizedData.length === 0) {
      return res.json({ message: 'No valid items found after filtering', count: 0, data: [] });
    }

    res.json({ 
      status: 'success',
      message: `Successfully synced ${sanitizedData.length} items from Google Sheets`, 
      count: sanitizedData.length,
      data: sanitizedData,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Import error:', error.message);
    
    let errorMessage = 'Internal Server Error';
    let statusCode = 500;
    
    if (error.response && error.response.status === 404) {
      errorMessage = 'Không tìm thấy file Google Sheets. Vui lòng kiểm tra ID hoặc quyền chia sẻ';
      statusCode = 404;
    }

    res.status(statusCode).json({ error: errorMessage, details: error.message });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { content, lang } = req.body || {};
    console.log('Received feedback:', { content, lang });

    if (supabase) {
      const { error } = await supabase
        .from('user_feedbacks')
        .insert([{ content, interface_lang: lang, created_at: new Date().toISOString() }] as any);
        
      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to save feedback to database' });
      }
    } else {
      console.warn('Supabase credentials not configured. Logging feedback only.');
    }
    
    res.status(200).json({ message: 'Feedback received successfully!' });
  } catch (err: any) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to process feedback', details: err.message });
  }
});

router.post('/expert-search', async (req, res) => {
  try {
    const { message } = req.body || {};
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const systemPrompt = "Bạn là một chuyên gia kỹ thuật lão làng với 30 năm kinh nghiệm trong ngành sản xuất giày da, am hiểu sâu sắc về Lean, cơ lý vật liệu, hóa chất ngành giày (Keo, xử lý bề mặt Outsole/Upper), tiêu chuẩn SOP, thử nghiệm chất lượng (SATRA, ISO) và các điểm kiểm soát CTQ.";
    const targetModel = req.body.model || APP_ENGINE_ID;
    const searchMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    let response;
    try {
      response = await createChatCompletion(
        getOpenAI(),
        { model: targetModel, messages: searchMessages, tools: [{ type: "web_search" }] as any },
        tuningFor(targetModel, 'expert-search')
      );
    } catch (searchError: any) {
      console.warn("Web search failed or quota exceeded. Falling back to offline knowledge.", searchError.message);
      response = await createChatCompletion(
        getOpenAI(),
        { model: targetModel, messages: searchMessages },
        tuningFor(targetModel, 'expert-search')
      );
    }

    const responseMessage = response.choices[0].message;
    
    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'expert_search',
      input_text: message,
      output_text: responseMessage.content,
      from_lang: 'auto',
      to_lang: 'vi',
      ip_address: (req as any).clientIp
    });

    res.json({ reply: responseMessage.content, annotations: (responseMessage as any).annotations || [] });
  } catch (error: any) {
    console.error('Expert search error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Expert search failed', details: error.message });
  }
});

router.get('/security-rules', async (req, res) => {
  if (!supabase) {
    return res.json({ pattern_text: '' });
  }
  try {
    const { data, error } = await (supabase as any)
      .from('security_rules')
      .select('pattern_text')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      return res.json({ pattern_text: data[0].pattern_text });
    }
    return res.json({ pattern_text: '' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch security rules' });
  }
});

router.post('/security-analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    const targetModel = req.body.model || APP_ENGINE_ID;
    const response = await createChatCompletion(
      getOpenAI(),
      {
        model: targetModel,
        messages: [
          {
            role: 'system',
            content: 'You are a security AI. Analyze the following spam/attack text. Return a JSON object with {"keywords": ["keyword1", "keyword2"]} that are most indicative of this spam.'
          },
          { role: 'user', content: text }
        ],
      },
      tuningFor(targetModel, 'security-analyze')
    );

    const result = JSON.parse(response.choices[0].message.content || '{"keywords":[]}');
    
    if (supabase && result.keywords && result.keywords.length > 0) {
      try {
        const { data: ruleData } = await (supabase as any)
          .from('security_rules')
          .select('*')
          .order('id', { ascending: false })
          .limit(1);

        if (ruleData && ruleData.length > 0) {
          const currentPattern = ruleData[0].pattern_text;
          const newKeywords = result.keywords.filter((kw: string) => kw && kw.trim() && !currentPattern.includes(kw.trim()));
          if (newKeywords.length > 0) {
            const updatedPattern = `${currentPattern}|${newKeywords.map((kw: string) => kw.trim()).join('|')}`;
            await (supabase as any)
              .from('security_rules')
              .update({ pattern_text: updatedPattern, updated_at: new Date().toISOString() })
              .eq('id', ruleData[0].id);
          }
        } else {
          await (supabase as any)
              .from('security_rules')
              .insert([{ pattern_text: result.keywords.map((kw: string) => kw.trim()).join('|'), updated_at: new Date().toISOString() }] as any);
        }
      } catch (dbErr) {
        console.error('Failed to update security_rules table:', dbErr);
      }
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/vocab', (req, res) => {
  res.status(410).json({ error: 'Database removed. Please use client-side localStorage and /api/import-vocab to sync.' });
});

// LƯU Ý: presence được giữ trong RAM của tiến trình. Netlify Functions là
// stateless (mỗi cold start bắt đầu lại từ 0, nhiều instance không chia sẻ
// Map), nên số người online chỉ chính xác trên Render server chạy liên tục.
// Các route dưới đây tồn tại để dashboard vẫn hoạt động khi
// VITE_RENDER_SERVER_URL trống và app chạy thuần trên Netlify.

router.post('/presence/ping', (req, res) => {
  const { sessionId } = req.body || {};
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid sessionId' });
  }
  res.json({ online: recordHeartbeat(sessionId.trim()) });
});

// requireAdmin gates this and /admin/responses: the latter returns real user
// text out of app_logs, and both used to answer anyone who knew the URL.
router.get('/admin/metrics', requireAdmin, async (req, res) => {
  const online = countOnline();
  if (!supabase) {
    return res.json({ online, totalRequests: 0, supabaseConfigured: false });
  }
  try {
    res.json({ online, totalRequests: await countTotalRequests(supabase), supabaseConfigured: true });
  } catch (error: any) {
    console.error('Failed to fetch admin metrics:', error);
    res.json({ online, totalRequests: 0, supabaseConfigured: true });
  }
});

router.get('/admin/responses', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
  try {
    res.json({ responses: await fetchRecentResponses(supabase, req.query.limit) });
  } catch (error: any) {
    console.error('Failed to fetch recent responses:', error);
    res.status(500).json({ error: 'Failed to fetch recent responses' });
  }
});

router.all('*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/', router);

export const handler = serverless(app);
