import { Handler } from '@netlify/functions';
import pg from 'pg';

const { Pool } = pg;
// Đảm bảo dùng DATABASE_URL đồng bộ với các file khác
const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!DATABASE_URL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database connection string missing' }) };
  }

  try {
    const { data } = JSON.parse(event.body || '{}');
    if (!Array.isArray(data) || data.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No data provided' }) };
    }

    const client = await pool.connect();
    try {
      await initDatabase(client);
      
      // Kỹ thuật Bulk Insert: Xây dựng 1 câu lệnh duy nhất
      // Dạng: INSERT INTO table (cols) VALUES ($1,$2...), ($7,$8...)
      const values: any[] = [];
      const placeholders = data.map((item, index) => {
        const offset = index * 6;
        values.push(
          item.id,
          item.term,
          item.meaning_vi,
          item.target_en || '',
          item.target_zh || '',
          item.enabled !== undefined ? item.enabled : true
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      }).join(',');

      const bulkQuery = `
        INSERT INTO vocab (id, term, meaning_vi, target_en, target_zh, enabled)
        VALUES ${placeholders}
        ON CONFLICT (id) DO UPDATE SET
          term = EXCLUDED.term,
          meaning_vi = EXCLUDED.meaning_vi,
          target_en = EXCLUDED.target_en,
          target_zh = EXCLUDED.target_zh,
          enabled = EXCLUDED.enabled,
          updated_at = CURRENT_TIMESTAMP
      `;

      await client.query('BEGIN');
      await client.query(bulkQuery, values);
      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: `Successfully imported ${data.length} items`,
          count: data.length 
        }),
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Import Error Details:', err);
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to import', details: error.message }),
    };
  }
};