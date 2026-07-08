import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: ReturnType<typeof createClient> | null = null;

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

  apiRouter.use((req, res, next) => {
    console.log(`[Admin Server] Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => res.json({ status: 'ok' }));

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
        const { count } = await supabase.from('app_logs').select('*', { count: 'exact', head: true });
        totalRequests = count || 0;
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
      const { data: logs } = await supabase.from('app_logs').select('ip_address, input_text, created_at').order('created_at', { ascending: false }).limit(100);
      res.json({
        ipTrackers: ipTrackers || [],
        logs: logs || []
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
        const { count } = await supabase.from('app_logs').select('*', { count: 'exact', head: true });
        totalRequests = count || 0;
      } catch (err) {}

      const { data: feedbacks } = await supabase.from('user_feedbacks').select('*').order('created_at', { ascending: false }).limit(50);
      const { data: logs } = await supabase.from('app_logs').select('ip_address, input_text, created_at').order('created_at', { ascending: false }).limit(100);
      const { data: ipTrackers } = await supabase.from('ip_tracker').select('*').order('last_request_at', { ascending: false });

      res.json({
        success: true,
        stats: { day: activeDay, week: activeWeek, month: activeMonth, totalRequests: totalRequests },
        feedbacks: feedbacks || [],
        logs: logs || [],
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

  // Catch-all for API routes to prevent falling through
  apiRouter.all('*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  app.use('/api', apiRouter);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Admin Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
