import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: any = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  
  // Enable CORS so the Netlify frontend can securely request data
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const PORT = Number(process.env.PORT) || 3000;

  // API Routes
  const apiRouter = express.Router();



  // POST /api/realtime/session
  apiRouter.post('/realtime/session', async (req, res) => {
    try {
      const { targetLang } = req.body;
      
      const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "aima-production-realtime"
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: "gpt-realtime-2.1", // Model tiêu chuẩn hỗ trợ đàm thoại WebRTC
            audio: {
              output: { voice: "marin" }
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `OpenAI Gateway Error: ${errorText}` });
      }

      const openAiData = await response.json();
      const cleanToken = openAiData?.client_secret?.value || openAiData?.value || ''; // Trích xuất trực tiếp thuộc tính value của tài liệu
      
      if (!cleanToken) {
        return res.status(500).json({ error: "Không tìm thấy mã token trong phản hồi từ OpenAI Gateway" });
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
    res.status(200).json({ status: "AIMA Engine Operational", version: "2.0.6-hotfix" });
  });

  // POST /api/public/log
  apiRouter.post('/public/log', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    const { task_type, input_text, output_text, device_uuid, from_lang, to_lang } = req.body;
    try {
      await supabase.from('app_logs').insert([
        {
          task_type,
          input_text,
          output_text,
          device_uuid,
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

  // GET /api/admin/kpis
  apiRouter.get('/admin/kpis', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      let activeDay = 0;
      let activeWeek = 0;
      let activeMonth = 0;
      let totalRequests = 0;

      try {
        const { count } = await supabase.from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', today.toISOString());
        activeDay = count || 0;
      } catch (err) { console.error('Error counting activeDay:', err); }

      try {
        const { count } = await supabase.from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', weekAgo.toISOString());
        activeWeek = count || 0;
      } catch (err) { console.error('Error counting activeWeek:', err); }

      try {
        const { count } = await supabase.from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', monthAgo.toISOString());
        activeMonth = count || 0;
      } catch (err) { console.error('Error counting activeMonth:', err); }

      try {
        const { count: totalCount, error: errTotal } = await supabase.from('app_logs').select('id', { count: 'exact' });
        totalRequests = totalCount || 0;
      } catch (err) { console.error('Error counting totalRequests:', err); }

      res.json({
        success: true,
        stats: {
          day: activeDay,
          week: activeWeek,
          month: activeMonth,
          totalRequests: totalRequests
        }
      });
    } catch (error: any) {
      console.error('Failed to fetch KPIs:', error);
      res.status(500).json({ error: 'Failed to fetch KPIs' });
    }
  });

  // GET /api/admin/feedbacks
  apiRouter.get('/admin/feedbacks', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    try {
      const { data: feedbacks } = await supabase.from('user_feedbacks').select('*').order('created_at', { ascending: false }).limit(100);
      res.json({ feedbacks: feedbacks || [] });
    } catch (error: any) {
      console.error('Failed to fetch feedbacks:', error);
      res.status(500).json({ error: 'Failed to fetch feedbacks' });
    }
  });

  // GET /api/admin/devices
  apiRouter.get('/admin/devices', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    try {
      const { data: ipTrackers } = await supabase.from('ip_tracker').select('*').order('last_request_at', { ascending: false });
      
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

      res.json({
        ipTrackers: ipTrackers || [],
        logs: logs
      });
    } catch (error: any) {
      console.error('Failed to fetch devices and logs:', error);
      res.status(500).json({ error: 'Failed to fetch devices' });
    }
  });

  // POST /api/admin/device-status
  apiRouter.post('/admin/device-status', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    const { ip_address, device_uuid, status } = req.body;
    const targetId = ip_address || device_uuid;
    if (!targetId || !status) return res.status(400).json({ error: 'Missing device_uuid/ip_address or status' });

    try {
      if (status === 'good') {
        await (supabase as any)
          .from('ip_tracker')
          .update({ status: 'good', spam_logs: null })
          .eq('ip_address', targetId);
      } else if (status === 'block') {
        await (supabase as any)
          .from('ip_tracker')
          .update({ status: 'block' })
          .eq('ip_address', targetId);
      } else if (status === 'warning') {
        await (supabase as any)
          .from('ip_tracker')
          .update({ status: 'warning' })
          .eq('ip_address', targetId);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to update device status:', error);
      res.status(500).json({ error: 'Failed to update device status' });
    }
  });

  // Backward compatibility routes
  apiRouter.get('/admin/data', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      let activeDay = 0;
      let activeWeek = 0;
      let activeMonth = 0;
      let totalRequests = 0;

      try {
        const { count } = await supabase.from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', today.toISOString());
        activeDay = count || 0;
      } catch (err) {}
      try {
        const { count } = await supabase.from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', weekAgo.toISOString());
        activeWeek = count || 0;
      } catch (err) {}
      try {
        const { count } = await supabase.from('ip_tracker').select('*', { count: 'exact', head: true }).gte('last_request_at', monthAgo.toISOString());
        activeMonth = count || 0;
      } catch (err) {}
      try {
        const { count: totalCount, error: errTotal } = await supabase.from('app_logs').select('id', { count: 'exact' });
        totalRequests = totalCount || 0;
      } catch (err) {}

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

      const { data: ipTrackers } = await supabase.from('ip_tracker').select('*').order('last_request_at', { ascending: false });

      res.json({
        success: true,
        stats: { day: activeDay, week: activeWeek, month: activeMonth, totalRequests: totalRequests },
        feedbacks: feedbacks || [],
        logs: logs,
        ipTrackers: ipTrackers || []
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch admin data' });
    }
  });

  apiRouter.post('/admin/ip-tracker/status', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    const { ip_address, status } = req.body;
    if (!ip_address || !status) return res.status(400).json({ error: 'Missing ip_address or status' });

    try {
      if (status === 'good') {
        await (supabase as any)
          .from('ip_tracker')
          .update({ status: 'good', spam_logs: null })
          .eq('ip_address', ip_address);
      } else if (status === 'block') {
        await (supabase as any)
          .from('ip_tracker')
          .update({ status: 'block' })
          .eq('ip_address', ip_address);
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
