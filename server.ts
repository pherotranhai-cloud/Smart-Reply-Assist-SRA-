import express from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
});

async function initDatabase() {
  if (!DATABASE_URL) {
    console.warn('NETLIFY_DATABASE_URL not defined. Backend sync will be disabled.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS vocab (
        id TEXT PRIMARY KEY,
        term TEXT NOT NULL,
        meaning_vi TEXT NOT NULL,
        target_en TEXT,
        target_zh TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  } finally {
    client.release();
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Initialize DB
  await initDatabase();

  // API Routes
  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`API Request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => res.json({ status: 'ok' }));

  apiRouter.post('/import-vocab', async (req, res) => {
    try {
      if (!DATABASE_URL) {
        return res.status(503).json({ error: 'Database connection not configured' });
      }

      const data = req.body;

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty data array' });
      }

      const sanitizedData = data.filter(item => 
        item && typeof item === 'object' && item.term && item.meaningVi
      ).map(item => ({
        term: item.term.trim(),
        meaning_vi: item.meaningVi.trim(),
        target_en: item.targetEn?.trim() || '',
        target_zh: item.targetZh?.trim() || '',
        enabled: item.enabled !== undefined ? item.enabled : true,
        id: item.id || crypto.randomUUID()
      }));

      if (sanitizedData.length === 0) {
        return res.status(400).json({ error: 'No valid vocabulary items found' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const query = `
          INSERT INTO vocab (id, term, meaning_vi, target_en, target_zh, enabled)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            term = EXCLUDED.term,
            meaning_vi = EXCLUDED.meaning_vi,
            target_en = EXCLUDED.target_en,
            target_zh = EXCLUDED.target_zh,
            enabled = EXCLUDED.enabled,
            updated_at = CURRENT_TIMESTAMP
        `;

        for (const item of sanitizedData) {
          await client.query(query, [
            item.id,
            item.term,
            item.meaning_vi,
            item.target_en,
            item.target_zh,
            item.enabled
          ]);
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({ 
        message: `Successfully imported ${sanitizedData.length} items`,
        count: sanitizedData.length
      });
    } catch (error: any) {
      console.error('Import error:', error);
      
      // Handle connection errors
      if (error.code === '28P01' || error.message.includes('password authentication failed')) {
        return res.status(401).json({ 
          error: 'Database Authentication Failed',
          details: 'Please check your NEON database credentials in NETLIFY_DATABASE_URL.'
        });
      }

      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  apiRouter.get('/vocab', async (req, res) => {
    try {
      if (!DATABASE_URL) {
        return res.status(503).json({ error: 'Database connection not configured' });
      }

      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM vocab ORDER BY created_at DESC');
        const mapped = result.rows.map(row => ({
          id: row.id,
          term: row.term,
          meaningVi: row.meaning_vi,
          targetEn: row.target_en,
          targetZh: row.target_zh,
          enabled: row.enabled
        }));
        res.json(mapped);
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Fetch error:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
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
