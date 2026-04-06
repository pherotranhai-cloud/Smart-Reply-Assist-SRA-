import express, { Router } from 'express';
import serverless from 'serverless-http';
import dotenv from 'dotenv';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';
import Papa from 'papaparse';
import OpenAI from 'openai';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const APP_ENGINE_ID = process.env.APP_ENGINE_ID || 'gpt-5_4-mini-2026-03-17';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const app = express();
const router = Router();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.post('/translate', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { text, targetLang, glossary, image } = req.body;
  try {
    const systemPrompt = `You are an expert ${targetLang.toUpperCase()} Industry Translator.
Your task is to translate the user's input into ${targetLang}.
Output ONLY the translated text. No explanations.

<glossary_rules>
${glossary || 'No specific glossary provided.'}
CRITICAL: You MUST use these exact translations. DO NOT use synonyms.
</glossary_rules>`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    if (image) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Translate the text in this image.' },
          { type: 'image_url', image_url: { url: image } }
        ]
      });
    }

    const response = await openai.chat.completions.create({
      model: APP_ENGINE_ID,
      messages,
      temperature: 0,
    });

    res.json({ translatedText: response.choices[0].message.content });
  } catch (error: any) {
    console.error('Translation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Translation failed', details: error.message });
  }
});

router.post('/compose', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { contextText, requirements, params, glossary, structuredSummary } = req.body;
  try {
    const systemPrompt = `You are an expert ${params.lang.toUpperCase()} Industry Translator and Factory Manager.
Your task is to compose a message based on the user's requirements.
Output ONLY the message body. No explanations.

<glossary_rules>
${glossary || 'No specific glossary provided.'}
CRITICAL: You MUST use these exact translations. DO NOT use synonyms.
</glossary_rules>

<critical_requirements>
- Target Audience: ${params.audience}
- Tone: ${params.tone}
- Output Language: ${params.lang}
- Format: ${params.format}
- Output ONLY the message body (if Email, include Subject line first).
- Max 200 words. No filler.
</critical_requirements>`;
    
    const response = await openai.chat.completions.create({
      model: APP_ENGINE_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${contextText}\n${requirements}` }
      ],
      temperature: 0,
    });

    res.json({ generatedReply: response.choices[0].message.content });
  } catch (error: any) {
    console.error('Compose error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Compose failed', details: error.message });
  }
});

router.post('/import-vocab', async (req, res) => {
  try {
    console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);
    
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;
    console.log("Fetching from URL:", sheetUrl);
    const response = await axios.get(sheetUrl, { timeout: 10000 });
    
    if (!response.data) {
      throw new Error('Empty response from Google Sheets');
    }

    const parsed = Papa.parse(response.data, {
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
      const target_zh = String(item.target_zh || item.chinese || item.tieng_trung || item.zh || '').trim();
      const enabledVal = item.enable !== undefined ? item.enable : item.enabled;
      const enabled = enabledVal !== false && String(enabledVal).toLowerCase() !== 'false';
      
      const hashInput = term ? `${term}-${meaning_vi}` : meaning_vi;
      const id = crypto.createHash('md5').update(hashInput).digest('hex');

      return {
        id,
        term: term || meaning_vi,
        meaning_vi,
        target_en,
        target_zh,
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
