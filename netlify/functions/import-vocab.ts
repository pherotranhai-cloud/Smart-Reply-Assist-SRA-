import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import axios from 'axios';
import Papa from 'papaparse';

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  
  try {
    console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);
    
    // 1. Fetch CSV from Google Sheets
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;
    console.log("Fetching from URL:", sheetUrl);
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
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No data found in Google Sheet', count: 0, data: [] }) };
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

      return {
        id,
        term: term || meaning_vi,
        meaning_vi,
        target_en,
        target_zh,
        enabled
      };
    }).filter((item: any) => item.meaning_vi); // Filter by meaning_vi

    if (sanitizedData.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No valid items found after filtering', count: 0, data: [] }) };
    }

    // 4. Return JSON directly to Frontend
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: 'success',
        message: `Successfully synced ${sanitizedData.length} items from Google Sheets`, 
        count: sanitizedData.length,
        data: sanitizedData,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error: any) {
    console.error('Sync Error:', error.message);
    
    let errorMessage = 'Sync failed';
    let statusCode = 500;
    
    if (error.response && error.response.status === 404) {
      errorMessage = 'Không tìm thấy file Google Sheets. Vui lòng kiểm tra ID hoặc quyền chia sẻ';
      statusCode = 404;
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({ 
        status: 'error',
        error: errorMessage, 
        details: error.message 
      }),
    };
  }
};