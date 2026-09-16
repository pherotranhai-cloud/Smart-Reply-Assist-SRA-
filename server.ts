import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import pkg from './package.json';
import {
  createSupabaseClient,
  countTotalRequests,
  fetchRecentResponses
} from './shared/adminService';
import { requireAdmin, warnIfAdminAuthUnconfigured } from './shared/adminAuth';
import { countOnline, recordHeartbeat } from './shared/presence';

dotenv.config();

const supabase = createSupabaseClient();

warnIfAdminAuthUnconfigured('server.ts');

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  
  // Enable CORS so the Netlify frontend can securely request data
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const PORT = 3000;

  // API Routes
  const apiRouter = express.Router();



  // POST /api/realtime/session
  apiRouter.post('/realtime/session', async (req, res) => {
    try {
      const { targetLang } = req.body;
      // targetLang sẽ nhận các chuỗi như 'Vietnamese', 'English', 'Indonesian'...
      
      // Bộ từ điển ánh xạ sang mã ISO chuẩn cho OpenAI
      const languageMapper: Record<string, string> = {
        'Vietnamese': 'vi',
        'Chinese (Simplified)': 'zh',
        'Chinese (Traditional)': 'zh',
        'English': 'en',
        'Indonesian': 'id',
        'Burmese': 'en'
      };
      
      // Lấy mã code tương ứng, mặc định fallback về tiếng Anh nếu không khớp
      const langCode = languageMapper[targetLang] || 'en';

      const response = await fetch("https://api.openai.com/v1/realtime/translations/client_secrets", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "aima-production-realtime"
        },
        // Payload TỐI GIẢN tuyệt đối, KHÔNG THÊM modalities hay instructions
        body: JSON.stringify({
          session: {
            model: "gpt-realtime-translate",
            audio: { 
              output: { language: langCode } 
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OpenAI Translation Error]:', errorText);
        return res.status(response.status).json({ error: `OpenAI Gateway Error: ${errorText}` });
      }

      const openAiData = await response.json();
      // Tương thích việc trích xuất token cho cả 2 trường hợp JSON trả về
      const cleanToken = openAiData?.client_secret?.value || openAiData?.value || '';
      
      if (!cleanToken) {
        return res.status(500).json({ error: "Không tìm thấy token phiên dịch từ OpenAI" });
      }

      return res.status(200).json({ token: cleanToken });
    } catch (error: any) {
      console.error('[Render Realtime Core Error]:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  apiRouter.use((req, res, next) => {
    console.log(`[Admin Server] Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => res.json({ status: 'ok' }));

  apiRouter.get('/', (req, res) => {
    res.status(200).json({ status: "AIMA Engine Operational", version: pkg.version });
  });

  // POST /api/public/log
  apiRouter.post('/public/log', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    const { task_type, input_text, output_text, from_lang, to_lang } = req.body;
    try {
      await supabase.from('app_logs').insert([
        {
          task_type,
          input_text,
          output_text,
          from_lang,
          to_lang,
          created_at: new Date().toISOString()
        }
      ]);
      res.json({ success: true });
    } catch (error) {
      console.error('[Render Log Ingestion Error]:', error);
      res.status(500).json({ error: 'Failed to write app_log' });
    }
  });

  // POST /api/presence/ping — nhịp tim giữ phiên "đang online" (chỉ lưu trong RAM)
  apiRouter.post('/presence/ping', (req, res) => {
    const { sessionId } = req.body || {};
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid sessionId' });
    }
    res.json({ online: recordHeartbeat(sessionId.trim()) });
  });

  // GET /api/admin/metrics — số người online + tổng requests.
  // requireAdmin gates this and /admin/responses: the latter returns real user
  // text out of app_logs, and both used to answer anyone who knew the URL.
  apiRouter.get('/admin/metrics', requireAdmin, async (req, res) => {
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

  // GET /api/admin/responses — 50 phản hồi gần nhất của app
  apiRouter.get('/admin/responses', requireAdmin, async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    try {
      res.json({ responses: await fetchRecentResponses(supabase, req.query.limit) });
    } catch (error: any) {
      console.error('Failed to fetch recent responses:', error);
      res.status(500).json({ error: 'Failed to fetch recent responses' });
    }
  });


  // Netlify fallback routes (translate, import-vocab, etc.)
  try {
    const path = await import('path');
    // Lấy chính xác đường dẫn tuyệt đối từ thư mục gốc của project trên đĩa Render
    const netlifyApiPath = path.join(process.cwd(), 'netlify', 'functions', 'api.ts');
    
    // Sử dụng dynamic import với đường dẫn tuyệt đối (bổ sung file:// cho chuẩn ESM URL)
    const netlifyModule = await import(`file://${netlifyApiPath}`).catch(() => import(`./netlify/functions/api.ts`));
    
    apiRouter.use(netlifyModule.router || netlifyModule.default);
    console.log('[ESM Bridge]: Khởi nạp Netlify Core Router thành công bằng đường dẫn tuyệt đối.');
  } catch (importError) {
    console.error('[ESM Bridge Error]: Không thể phân giải Netlify Router tại gốc:', importError);
  }

  // Catch-all for API routes to prevent falling through
  apiRouter.all('*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const path = await import('path');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
