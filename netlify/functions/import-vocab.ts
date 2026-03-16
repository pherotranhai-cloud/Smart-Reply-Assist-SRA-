import { Handler } from '@netlify/functions';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  
  try {
    const body = JSON.parse(event.body || '{}');
    let items = Array.isArray(body) ? body : (body.data || body.items || []);

    if (items.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Data is empty', debug: body }) };
    }

    // MAPPER tối ưu cho file "Vocabulary Library.csv"
    const sanitizedData = items.map((item: any) => {
      // Khớp chính xác với tiêu đề trong file CSV của bạn
      const term = item.Term || item.term || '';
      const meaning = item['Meaning (VI)'] || item.meaning_vi || '';
      const en = item['Target EN'] || item.target_en || '';
      const zh = item['Target ZH'] || item.target_zh || '';
      
      // Chỉ lấy những dòng có đủ Term và Meaning
      if (!term || !meaning) return null;

      return {
        id: crypto.createHash('md5').update(`${term}-${meaning}`).digest('hex'),
        term: String(term).trim(),
        meaning_vi: String(meaning).trim(),
        target_en: String(en).trim(),
        target_zh: String(zh).trim(),
        enabled: true
      };
    }).filter(Boolean);

    if (sanitizedData.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid rows found. Check column names.' }) };
    }

    const client = await pool.connect();
    try {
      const values: any[] = [];
      const placeholders = sanitizedData.map((item, index) => {
        const o = index * 6;
        values.push(item.id, item.term, item.meaning_vi, item.target_en, item.target_zh, item.enabled);
        return `($${o+1}, $${o+2}, $${o+3}, $${o+4}, $${o+5}, $${o+6})`;
      }).join(',');

      const query = `
        INSERT INTO vocab (id, term, meaning_vi, target_en, target_zh, enabled)
        VALUES ${placeholders}
        ON CONFLICT (id) DO UPDATE SET
          term = EXCLUDED.term,
          meaning_vi = EXCLUDED.meaning_vi,
          target_en = EXCLUDED.target_en,
          target_zh = EXCLUDED.target_zh,
          updated_at = CURRENT_TIMESTAMP;
      `;

      await client.query('BEGIN');
      await client.query(query, values);
      await client.query('COMMIT');

      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ message: `Successfully imported ${sanitizedData.length} items from CSV` }) 
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Import failed', details: error.message }) };
  }
};