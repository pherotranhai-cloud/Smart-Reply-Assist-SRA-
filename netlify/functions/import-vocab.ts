import { Handler } from '@netlify/functions';
import pg from 'pg';
import crypto from 'crypto';
import format from 'pg-format';
import axios from 'axios';
import Papa from 'papaparse';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  
  // Admin Security Check (Header or Query Param)
  const adminKey = event.headers['x-admin-key'] || event.queryStringParameters?.key;
  if (!ADMIN_SECRET_KEY || adminKey !== ADMIN_SECRET_KEY) {
    return { 
      statusCode: 401, 
      headers, 
      body: JSON.stringify({ error: 'Unauthorized: Admin access required' }) 
    };
  }

  if (!DATABASE_URL) return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB Configuration Missing' }) };

  try {
    console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);
    
    // 1. Fetch CSV from Google Sheets
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv`;
    const response = await axios.get(sheetUrl, { timeout: 10000 });
    
    if (!response.data) {
      throw new Error('Empty response from Google Sheets');
    }

    // 2. Parse CSV
    const parsed = Papa.parse(response.data, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    });

    const rawData = parsed.data;
    if (rawData.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No data found in Google Sheet', count: 0 }) };
    }

    // 3. Sanitize and Prepare Data
    const sanitizedData = rawData.map((item: any) => {
      const term = String(item.term || item.category || '').trim();
      const meaning_vi = String(item.meaning_vi || item.vietnamese || item.tieng_viet || item.vi || '').trim();
      const target_en = String(item.target_en || item.english || item.tieng_anh || item.en || '').trim();
      const target_zh = String(item.target_zh || item.chinese || item.tieng_trung || item.zh || '').trim();
      const enabledVal = item.enable !== undefined ? item.enable : item.enabled;
      const enabled = enabledVal !== false && String(enabledVal).toLowerCase() !== 'false';
      
      const hashInput = term ? `${term}-${meaning_vi}` : meaning_vi;
      const id = crypto.createHash('md5').update(hashInput).digest('hex');

      return [id, term || meaning_vi, meaning_vi, target_en, target_zh, enabled];
    }).filter((item: any) => item[2]); // Filter by meaning_vi

    if (sanitizedData.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No valid items found after filtering', count: 0 }) };
    }

    // 4. Database Transaction
    const client = await pool.connect();
    try {
      await initDatabase(client);
      await client.query('BEGIN');
      
      // Clean Slate
      await client.query('DELETE FROM vocab');
      
      // Bulk Insert
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
          status: 'success',
          message: `Successfully synced ${sanitizedData.length} items from Google Sheets`, 
          count: sanitizedData.length,
          timestamp: new Date().toISOString()
        }),
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Sync Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        status: 'error',
        error: 'Sync failed', 
        details: error.message 
      }),
    };
  }
};