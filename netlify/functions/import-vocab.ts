import { Handler } from '@netlify/functions';
import pg from 'pg';
import crypto from 'crypto';
import axios from 'axios';

const { Pool } = pg;

// Cấu hình Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // 1. Kiểm tra bảo mật (Admin Key)
  const adminKey = event.queryStringParameters?.key || event.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized: Missing or invalid key' }) };
  }

  // 2. Lấy Google Sheet ID từ biến môi trường
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing GOOGLE_SHEET_ID config' }) };
  }

  const googleSheetsUrl = `https://docs.google.com/spreadsheets/d/$16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY/export?format=csv`;

  try {
    // 3. Tải dữ liệu CSV từ Google Sheets
    const response = await axios.get(googleSheetsUrl);
    const csvData = response.data;

    // 4. Parse CSV đơn giản (Tách dòng và cột)
    const rows = csvData.split(/\r?\n/).map((row: string) => row.split(','));
    const csvHeaders = rows[0];
    const dataRows = rows.slice(1);

    const sanitizedData = dataRows.map((row: any[]) => {
      // Ánh xạ cột dựa trên tiêu đề file của bạn
      // Index: 0=Term, 1=Meaning (VI), 2=Target EN, 3=Target ZH
      const term = (row[0] || '').trim();
      const meaning = (row[1] || '').trim();
      const en = (row[2] || '').trim();
      const zh = (row[3] || '').trim();

      if (!term || !meaning) return null;

      return {
        id: crypto.createHash('md5').update(`${term}-${meaning}`).digest('hex'),
        term,
        meaning_vi: meaning,
        target_en: en,
        target_zh: zh,
        enabled: true
      };
    }).filter(Boolean);

    if (sanitizedData.length === 0) {
      throw new Error('No valid data found in Google Sheets');
    }

    // 5. Database Transaction: Xóa và Nạp lại
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM vocab');

      // Sử dụng Bulk Insert an toàn (tránh lỗi Parameter mismatch)
      for (let i = 0; i < sanitizedData.length; i += 20) {
          const chunk = sanitizedData.slice(i, i + 20); // Chia nhỏ từng cụm 20 dòng để an toàn
          for (const item of chunk) {
              await client.query(
                `INSERT INTO vocab (id, term, meaning_vi, target_en, target_zh, enabled) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [item.id, item.term, item.meaning_vi, item.target_en, item.target_zh, item.enabled]
              );
          }
      }

      await client.query('COMMIT');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: `Auto-Sync Success! Imported ${sanitizedData.length} items.`,
          source: 'Google Sheets'
        })
      };
    } catch (dbError: any) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('Sync Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Sync Failed', details: error.message })
    };
  }
};
