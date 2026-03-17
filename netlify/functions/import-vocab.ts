import { Handler } from '@netlify/functions';
import pg from 'pg';
import crypto from 'crypto';
import format from 'pg-format';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase(client: pg.PoolClient) {
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
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  
  // Admin Security Check
  const adminKey = event.headers['x-admin-key'];
  if (!ADMIN_SECRET_KEY || adminKey !== ADMIN_SECRET_KEY) {
    return { 
      statusCode: 401, 
      headers, 
      body: JSON.stringify({ error: 'Unauthorized: Admin access required' }) 
    };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!DATABASE_URL) return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB Missing' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const rawData = Array.isArray(body) ? body : (body.data || []);
    
    if (rawData.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No data provided or empty array' }) };
    }

    const sanitizedData = rawData.map((item: any) => {
      // Normalize keys: trim, lowercase, replace non-alphanumeric with underscore
      const normalized: any = {};
      Object.keys(item).forEach(key => {
        const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        normalized[normalizedKey] = item[key];
      });

      const term = String(normalized.term || normalized.category || '').trim();
      const meaning_vi = String(normalized.meaning_vi || normalized.vietnamese || normalized.tieng_viet || normalized.vi || '').trim();
      const target_en = String(normalized.target_en || normalized.english || normalized.tieng_anh || normalized.en || '').trim();
      const target_zh = String(normalized.target_zh || normalized.chinese || normalized.tieng_trung || normalized.zh || '').trim();
      const enabledVal = normalized.enable !== undefined ? normalized.enable : normalized.enabled;
      const enabled = enabledVal !== false && String(enabledVal).toLowerCase() !== 'false';
      
      const hashInput = term ? `${term}-${meaning_vi}` : meaning_vi;
      const id = crypto.createHash('md5').update(hashInput).digest('hex');

      return [id, term || meaning_vi, meaning_vi, target_en, target_zh, enabled];
    }).filter((item: any) => item[2]); // Filter by meaning_vi

    if (sanitizedData.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No valid vocabulary items found after filtering' }),
      };
    }

    const client = await pool.connect();
    try {
      await initDatabase(client);
      await client.query('BEGIN');
      
      // Clean Slate
      await client.query('DELETE FROM vocab');
      
      // Bulk Insert using pg-format to avoid parameter limits
      const query = format(
        'INSERT INTO vocab (id, term, meaning_vi, target_en, target_zh, enabled) VALUES %L',
        sanitizedData
      );
      
      await client.query(query);
      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: `Successfully imported ${sanitizedData.length} items (Clean Slate Mode)`, 
          count: sanitizedData.length 
        }),
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid Request Format', details: error.message }),
    };
  }
};