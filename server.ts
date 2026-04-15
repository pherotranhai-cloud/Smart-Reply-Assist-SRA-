import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import Papa from 'papaparse';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL_NAME = process.env.AI_MODEL_NAME || 'gpt-4o-mini';

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 requests per windowMs
  message: 'Too many requests, please try again later.',
});

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`API Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => res.json({ status: 'ok' }));

  apiRouter.post('/translate', limiter, async (req, res) => {
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY in environment.");
      return res.status(500).json({ error: "Server Configuration Error" });
    }

    const { text, targetLang, glossary, image } = req.body;
    try {
      // 1. Minified System Prompt (Already optimized for Factory Context)
      const systemPrompt = `Translate to ${targetLang} with 100% technical accuracy. Maintain original factory tone (strict/urgent).
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
Output ONLY the translated text. No explanations. No introduction.`;

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

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: AI_MODEL_NAME,
        messages,
        temperature: 0,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      res.json({ translatedText: response.data.choices[0].message.content });
    } catch (error: any) {
      console.error('Translation error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Translation failed' });
    }
  });

  apiRouter.post('/ocr', limiter, async (req, res) => {
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY in environment.");
      return res.status(500).json({ error: "Server Configuration Error" });
    }

    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    try {
      const systemPrompt = `You are an OCR engine. Extract all visible text from this image exactly as written. Preserve all line breaks, lists, and spacing. DO NOT translate. DO NOT explain. Output ONLY the extracted text.`;

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ];

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: AI_MODEL_NAME,
        messages,
        temperature: 0,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      res.json({ extractedText: response.data.choices[0].message.content });
    } catch (error: any) {
      console.error('OCR error:', error.response?.data || error.message);
      res.status(500).json({ error: 'OCR extraction failed' });
    }
  });

  apiRouter.post('/compose', limiter, async (req, res) => {
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY in environment.");
      return res.status(500).json({ error: "Server Configuration Error" });
    }

    const { contextText, requirements, params, glossary, structuredSummary } = req.body;
    try {
        const systemPrompt = `You are an expert ${params.lang.toUpperCase()} Industry Translator and Factory Manager.
  Your task is to compose a message based on the user's requirements.
  Output ONLY the message body. No explanations.

  <glossary_integration>
  The following is a JSON array of industry-specific terms and their required translations:
  ${glossary || '[]'}
  CRITICAL: Use these exact terms from the glossary to maintain technical authority.
  </glossary_integration>

  <critical_requirements>
  - Target Audience: ${params.audience}
  - Tone: ${params.tone}
  - Output Language: ${params.lang}
  - Format: ${params.format}
  - Output ONLY the message body (if Email, include Subject line first).
  - Max 200 words. No filler.
  </critical_requirements>`;
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: AI_MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${contextText}\n${requirements}` }
        ],
        temperature: 0,
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      res.json({ generatedReply: response.data.choices[0].message.content });
    } catch (error: any) {
      console.error('Compose error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Compose failed' });
    }
  });

  // Replicate Netlify function logic for local development
  apiRouter.post('/import-vocab', async (req, res) => {
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

  // Since we don't have a DB, /vocab API might not be needed if frontend uses localStorage.
  // We'll return 404 or a message to use localStorage.
  apiRouter.get('/vocab', (req, res) => {
    res.status(410).json({ error: 'Database removed. Please use client-side localStorage and /api/import-vocab to sync.' });
  });

  // Catch-all for API routes to prevent falling through to SPA fallback
  apiRouter.all('*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  app.use('/api', apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
