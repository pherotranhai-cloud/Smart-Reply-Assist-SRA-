import express, { Router } from 'express';
import serverless from 'serverless-http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';
import Papa from 'papaparse';
import { createSupabaseClient } from '../../shared/supabase';
import { logToSupabase } from '../../shared/appLogs';
import { resolveLanguage, startTranslation, logTranslation } from '../../shared/translate';
import { buildComposeSystemPrompt, buildComposeUserMessage } from '../../shared/compose';

// Re-exported for existing callers/tests of the prompt builder.
export { buildTranslateSystemPrompt } from '../../shared/translate';
import { normalizeHeader, extractVocabRow, vocabHashKey, hasSourcePhrase } from '../../shared/vocabNormalize';
import {
  APP_ENGINE_ID,
  resolveModel,
  getAnthropic,
  createMessage,
  streamText,
  extractText,
  extractUrlCitations,
  imageBlock,
} from '../../shared/modelConfig';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

const supabase = createSupabaseClient();

const app = express();
export const router = Router();

app.use(cors());
app.use(express.json({ limit: '10mb' }));


router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.post('/translate', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  // Same code path as the streaming Netlify function
  // (netlify/functions/translate.mts); see shared/translate.ts.
  try {
    const stream = await startTranslation(req.body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let outputText = '';
    for await (const content of stream) {
      if (content) {
        outputText += content;
        res.write(content);
      }
    }
    res.end();

    // Non-blocking log to Supabase
    logTranslation(req.body, outputText, (req as any).clientIp);
  } catch (error: any) {
    console.error('Translation error:', error.response?.data || error.message);
    // A failure mid-stream arrives after the SSE headers went out; just close.
    if (res.headersSent) return res.end();
    res.status(500).json({ error: 'Translation failed', details: error.message });
  }
});

router.post('/ocr', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  try {
    const systemPrompt = "Bạn là một máy nhận diện ký tự quang học siêu tốc. Hãy bóc tách chính xác toàn bộ văn bản có trong hình ảnh này thành chuỗi ký tự thô. Tuyệt đối không mô tả ảnh, không giải thích ngữ cảnh, trả về duy nhất chữ tìm được để tối ưu hóa Latency tối đa.";

    const response = await createMessage(getAnthropic(), 'ocr', {
      model: resolveModel(req.body.model || APP_ENGINE_ID),
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageBlock(image)] }],
    });

    res.json({ extractedText: extractText(response) });
  } catch (error: any) {
    console.error('OCR error:', error.response?.data || error.message);
    res.status(500).json({ error: 'OCR extraction failed', details: error.message });
  }
});

router.post('/compose', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { contextText, requirements, params, glossary } = req.body;
  try {
    // The prompt (one description per preset, audience, tone, length and
    // format) lives in shared/compose.ts, next to its tests.
    const { mappedLang } = resolveLanguage(params?.lang || 'English');
    const response = await createMessage(getAnthropic(), 'compose', {
      model: resolveModel(req.body.model || APP_ENGINE_ID),
      system: buildComposeSystemPrompt(params ?? {}, glossary),
      messages: [{ role: 'user', content: buildComposeUserMessage(contextText, requirements) }],
    });

    const outputText = extractText(response);

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

    if (!ANTHROPIC_API_KEY) {
      console.error("Missing ANTHROPIC_API_KEY in environment.");
      return res.status(500).json({ error: "Server Configuration Error" });
    }

    const systemPrompt = "Bạn là một chuyên gia kỹ thuật lão làng với 30 năm kinh nghiệm trong ngành sản xuất giày da, am hiểu sâu sắc về Lean, cơ lý vật liệu, hóa chất ngành giày (Keo, xử lý bề mặt Outsole/Upper), tiêu chuẩn SOP, thử nghiệm chất lượng (SATRA, ISO) và các điểm kiểm soát CTQ.";

    const searchRequest = {
      model: resolveModel(req.body.model || APP_ENGINE_ID),
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: message }],
    };

    let response;
    try {
      response = await createMessage(getAnthropic(), 'expert-search', {
        ...searchRequest,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      });
    } catch (searchError: any) {
      console.warn("Web search failed or quota exceeded. Falling back to offline knowledge.", searchError.message);
      response = await createMessage(getAnthropic(), 'expert-search', searchRequest);
    }

    const replyText = extractText(response);
    
    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'expert_search',
      input_text: message,
      output_text: replyText,
      from_lang: 'auto',
      to_lang: 'vi',
      ip_address: (req as any).clientIp
    });

    res.json({ reply: replyText, annotations: extractUrlCitations(response) });
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
    const response = await createMessage(getAnthropic(), 'security-analyze', {
      model: resolveModel(req.body.model || APP_ENGINE_ID),
      system: 'You are a security AI. Analyze the following spam/attack text. Return a JSON object with {"keywords": ["keyword1", "keyword2"]} that are most indicative of this spam.',
      messages: [{ role: 'user', content: text }],
      jsonSchema: {
        type: 'object',
        properties: { keywords: { type: 'array', items: { type: 'string' } } },
        required: ['keywords'],
        additionalProperties: false,
      },
    });

    const result = JSON.parse(extractText(response) || '{"keywords":[]}');
    
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

router.all('*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/', router);

export const handler = serverless(app);
