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
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const APP_ENGINE_ID = process.env.APP_ENGINE_ID || 'gpt-5.4-mini-2026-03-17';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
}

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

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const app = express();
export const router = Router();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let ipBlacklistCache = new Set<string>();
let lastBlacklistFetch = 0;

const fetchBlacklist = async () => {
  if (!supabase) return;
  const now = Date.now();
  if (now - lastBlacklistFetch < 60000) return; // cache 1 min
  try {
    const { data } = await supabase.from('ip_blacklist').select('ip');
    if (data) {
      ipBlacklistCache = new Set(data.map((d: any) => d.ip));
      lastBlacklistFetch = now;
    }
  } catch (err) {
    console.error('Failed to fetch blacklist', err);
  }
};

app.use(async (req, res, next) => {
  await fetchBlacklist();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const clientIp = typeof ip === 'string' ? ip.split(',')[0].trim() : 'unknown';
  (req as any).clientIp = clientIp;

  if (supabase) {
    try {
      const { data: trackers } = await (supabase as any)
        .from('ip_tracker')
        .select('*')
        .eq('ip_address', clientIp);

      if (trackers && trackers.length > 0) {
        const tracker = trackers[0];
        if (tracker.status === 'block') {
          return res.status(403).json({ error: 'IP_BANNED' });
        }
        await (supabase as any)
          .from('ip_tracker')
          .update({ last_request_at: new Date().toISOString() })
          .eq('ip_address', clientIp);
      } else {
        await (supabase as any)
          .from('ip_tracker')
          .insert([{ ip_address: clientIp, status: 'good', last_request_at: new Date().toISOString() }] as any);
      }
    } catch (err) {
      console.error('IP Tracker Middleware error:', err);
    }
  }
  
  if (ipBlacklistCache.has(clientIp)) {
    return res.status(403).json({ error: 'IP_BANNED' });
  }
  
  next();
});

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.post('/translate', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { text, targetLang, glossary, image, summarize, isAuto } = req.body;
  try {
    // 1. Minified System Prompt (Already optimized for Factory Context)
    let explicitTargetLang = targetLang;
    let explicitScriptInstruction = '';
    
    if (targetLang === 'Chinese (Traditional)' || targetLang === 'zh-TW') {
      explicitTargetLang = 'Chinese (Traditional)';
      explicitScriptInstruction = '\nEnsure all output characters are strictly Traditional Chinese (繁體中文).';
    }

    const summaryInstruction = summarize ? `
You MUST NOT output the full translation. Instead, output ONLY a structured summary in ${explicitTargetLang} using the following Markdown format exactly:

### 📋 [Brief Summary Title]
**Nội dung chính / Tổng quan:**
[A short 2-3 sentence paragraph summarizing the context]

**📌 Ý chính cần nắm (Key Takeaways):**
- *[Key Point 1]*: Detailed description of the action or key information.
- *[Key Point 2]*: Next action, timing, or affected entity.
- *[Key Point 3]*: (If applicable) Important notes or warnings from the original text.` : `Output ONLY the translated text. No explanations. No introduction.`;

    const systemPrompt = `Translate to ${explicitTargetLang} with 100% technical accuracy. Maintain original factory tone (strict/urgent).${explicitScriptInstruction}
<rules>
1. DO NOT translate models, codes, brands.
2. Keep metrics unchanged. Translate quantifiers.
3. Keep @names original. Translate job titles using glossary.
4. Use glossary for factory terms.
</rules>
<glossary_strict_mode>
The following is a JSON array of technical terms and their required translations:
${glossary || '[]'}
CRITICAL: You MUST use these exact translations for the corresponding terms. DO NOT use synonyms.
</glossary_strict_mode>
${summaryInstruction}`;

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

    const targetModel = isAuto ? "gpt-5.4-nano-2026-03-17" : APP_ENGINE_ID;

    const stream = await openai.chat.completions.create({
      model: targetModel,
      messages,
      temperature: 0,
      stream: true
    });

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
    if (!isAuto) {
      logToSupabase({
        task_type: 'translate',
        input_text: text || '[Image only]',
        output_text: outputText,
        from_lang: 'auto',
        to_lang: targetLang,
        ip_address: (req as any).clientIp
      });
    }
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

    const response = await openai.chat.completions.create({
      model: "gpt-5.4-nano-2026-03-17",
      messages,
      temperature: 0,
    });

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

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
      top_p: 0.8,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: 80,
      stream: true,
    });

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

  const { contextText, requirements, params, glossary, structuredSummary } = req.body;
  try {
    let mappedLang = params.lang;
    let scriptRule = '';

    if (params.lang === 'Chinese (Simplified)' || params.lang === 'zh-CN') {
      mappedLang = 'Chinese (Simplified Hanzi)';
      scriptRule = "MUST use Simplified Chinese characters.";
    } else if (params.lang === 'Chinese (Traditional)' || params.lang === 'zh-TW') {
      mappedLang = 'Chinese (Traditional)';
      scriptRule = "Ensure all output characters are strictly Traditional Chinese (繁體中文).";
    } else if (params.lang === 'Indonesian' || params.lang === 'id') {
      mappedLang = 'Indonesian (Bahasa Indonesia)';
    } else if (params.lang === 'Burmese' || params.lang === 'my') {
      mappedLang = 'Burmese (Myanmar Unicode)';
    }

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
    
    const response = await openai.chat.completions.create({
      model: APP_ENGINE_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${contextText}\n${requirements}` }
      ],
      temperature: 0,
    });

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
      transformHeader: (header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    });

    const rawData = parsed.data;
    if (rawData.length === 0) {
      return res.json({ message: 'No data found in Google Sheet', count: 0, data: [] });
    }

    const sanitizedData = rawData.map((item: any) => {
      const term = String(item.term || item.category || '').trim();
      const meaning_vi = String(item.meaning_vi || item.vietnamese || item.tieng_viet || item.vi || '').trim();
      const target_en = String(item.target_en || item.english || item.tieng_anh || item.en || '').trim();
      
      // Legacy fallbacks for Chinese
      const legacyZh = String(item.target_zh || item.chinese || item.tieng_trung || item.zh || '').trim();
      const target_zh_cn = String(item.target_zh_cn || item.chinese_simplified || item.zh_cn || legacyZh).trim();
      const target_zh_tw = String(item.target_zh_tw || item.chinese_traditional || item.zh_tw || legacyZh).trim();
      
      // New targets
      const target_id = String(item.target_id || item.indonesian || item.tieng_indo || item.id || '').trim();
      const target_my = String(item.target_my || item.burmese || item.tieng_myanmar || item.my || '').trim();

      const enabledVal = item.enable !== undefined ? item.enable : item.enabled;
      const enabled = enabledVal !== false && String(enabledVal).toLowerCase() !== 'false';
      
      const hashInput = term ? `${term}-${meaning_vi}` : meaning_vi;
      const id = crypto.createHash('md5').update(hashInput).digest('hex');

      return {
        id,
        term: term || meaning_vi,
        meaning_vi,
        target_en,
        target_zh_cn,
        target_zh_tw,
        target_id,
        target_my,
        enabled
      };
    }).filter((item: any) => item.meaning_vi);

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

    let response;
    try {
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        tools: [{ type: "web_search" }] as any,
        temperature: 0.2,
      });
    } catch (searchError: any) {
      console.warn("Web search failed or quota exceeded. Falling back to offline knowledge.", searchError.message);
      response = await openai.chat.completions.create({
        model: APP_ENGINE_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.2,
      });
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
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-nano-2026-03-17',
      messages: [
        {
          role: 'system',
          content: 'You are a security AI. Analyze the following spam/attack text. Return a JSON object with {"keywords": ["keyword1", "keyword2"]} that are most indicative of this spam.'
        },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' }
    });

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

router.get('/admin/data', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Active user stats from ip_tracker and total count from app_logs
    const [{ count: activeDay }, { count: activeWeek }, { count: activeMonth }, { count: totalRequests }] = await Promise.all([
      (supabase as any).from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', today.toISOString()),
      (supabase as any).from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', weekAgo.toISOString()),
      (supabase as any).from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', monthAgo.toISOString()),
      (supabase as any).from('app_logs').select('*', { count: 'exact', head: true })
    ]);

    const { data: feedbacks } = await supabase.from('user_feedbacks').select('*').order('created_at', { ascending: false }).limit(50);
    
    let logs: any[] = [];
    const { data: logsWithIp, error: logsError } = await supabase
      .from('app_logs')
      .select('ip_address, input_text, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (logsError) {
      console.warn("Failed to fetch logs with ip_address, retrying without ip_address...", logsError.message);
      const { data: logsNoIp, error: retryError } = await supabase
        .from('app_logs')
        .select('input_text, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (retryError) {
        throw retryError;
      }
      logs = (logsNoIp || []).map(log => ({ ...log, ip_address: '' }));
    } else {
      logs = logsWithIp || [];
    }

    const { data: ipTrackers } = await (supabase as any).from('ip_tracker').select('*').order('last_request_at', { ascending: false });

    res.json({
      stats: { day: activeDay || 0, week: activeWeek || 0, month: activeMonth || 0, totalRequests: totalRequests || 0 },
      feedbacks: feedbacks || [],
      logs: logs,
      ipTrackers: ipTrackers || []
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch admin data' });
  }
});

router.post('/admin/ip-tracker/status', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
  const { ip_address, status } = req.body;
  if (!ip_address || !status) return res.status(400).json({ error: 'Missing ip_address or status' });

  try {
    if (status === 'good') {
      await (supabase as any)
        .from('ip_tracker')
        .update({ status: 'good', spam_logs: null })
        .eq('ip_address', ip_address);
      ipBlacklistCache.delete(ip_address);
    } else if (status === 'block') {
      await (supabase as any)
        .from('ip_tracker')
        .update({ status: 'block' })
        .eq('ip_address', ip_address);
      ipBlacklistCache.add(ip_address);
    } else if (status === 'warning') {
      await (supabase as any)
        .from('ip_tracker')
        .update({ status: 'warning' })
        .eq('ip_address', ip_address);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update IP tracker status' });
  }
});

router.post('/admin/blacklist', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing ip' });

  try {
    await supabase.from('ip_blacklist').insert([{ ip, created_at: new Date().toISOString() }] as any);
    ipBlacklistCache.add(ip);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to blacklist IP' });
  }
});

router.all('*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/', router);

export const handler = serverless(app);
