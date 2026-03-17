import { Handler } from '@netlify/functions';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!DATABASE_URL) return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB Missing' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    // Chấp nhận cả { data: [] } hoặc trực tiếp []
    const rawData = Array.isArray(body) ? body : (body.data || []);
    
    if (rawData.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No data provided or empty array' }) };
    }

    // Chuẩn hóa dữ liệu và tạo ID bằng MD5 hash của term + meaning_vi
    const sanitizedData = rawData.map((item: any) => {
      const term = String(item.term || '').trim();
      const meaning_vi = String(item.meaning_vi || '').trim();
      const target_en = String(item.target_en || '').trim();
      const target_zh = String(item.target_zh || '').trim();
      // Chấp nhận cả boolean và string "true"/"false"
      const enabled = item.enabled !== false && String(item.enabled).toLowerCase() !== 'false';
      
      // Luôn tạo ID dựa trên nội dung để đảm bảo tính nhất quán
      const id = crypto.createHash('md5').update(`${term}-${meaning_vi}`).digest('hex');

      return {
        id,
        term,
        meaning_vi,
        target_en,
        target_zh,
        enabled
      };
    }).filter((item: any) => item.term && item.meaning_vi);

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
      
      const values: any[] = [];
      const placeholders = sanitizedData.map((item, index) => {
        const offset = index * 6;
        values.push(item.id, item.term, item.meaning_vi, item.target_en, item.target_zh, item.enabled);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      }).join(',');

      // Vì đã DELETE FROM vocab trước đó, chúng ta không cần ON CONFLICT nữa
      const bulkQuery = `
        INSERT INTO vocab (id, term, meaning_vi, target_en, target_zh, enabled)
        VALUES ${placeholders}
      `;

      await client.query('BEGIN');
      // Clean Slate: Xóa toàn bộ dữ liệu cũ trước khi chèn mới
      await client.query('DELETE FROM vocab');
      // Thực hiện Bulk Insert
      await client.query(bulkQuery, values);
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
      statusCode: 400, // Trả về 400 nếu JSON hỏng hoặc map lỗi
      headers,
      body: JSON.stringify({ error: 'Invalid Request Format', details: error.message }),
    };
  }
};