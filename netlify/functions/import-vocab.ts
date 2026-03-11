import { Handler } from '@netlify/functions';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  if (!DATABASE_URL) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'Database connection not configured' }),
    };
  }

  try {
    const data = JSON.parse(event.body || '[]');

    if (!Array.isArray(data) || data.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or empty data array' }),
      };
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
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No valid vocabulary items found' }),
      };
    }

    const client = await pool.connect();
    try {
      await initDatabase(client);
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: `Successfully imported ${sanitizedData.length} items`,
        count: sanitizedData.length
      }),
    };
  } catch (error: any) {
    console.error('Import error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
