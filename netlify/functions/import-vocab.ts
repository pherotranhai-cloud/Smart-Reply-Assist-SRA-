import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import axios from 'axios';
import Papa from 'papaparse';
import { normalizeHeader, extractVocabRow, vocabHashKey, hasSourcePhrase } from '../../shared/vocabNormalize';

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
      transformHeader: normalizeHeader
    });

    const rawData = parsed.data;
    if (rawData.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No data found in Google Sheet', count: 0, data: [] }) };
    }

    // 3. Sanitize and prepare data. VocabItem's shape lives in
    // shared/vocabNormalize.ts — kept in one place because it used to drift
    // between this handler and api.ts's /import-vocab route.
    const sanitizedData = (rawData as Record<string, any>[])
      .map((item) => {
        const fields = extractVocabRow(item);
        const id = crypto.createHash('md5').update(vocabHashKey(fields)).digest('hex');
        return { id, ...fields };
      })
      .filter(hasSourcePhrase);

    if (sanitizedData.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'No valid items found after filtering', count: 0, data: [] }) };
    }

    // 4. Return JSON directly to Frontend
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: 'success',
        count: sanitizedData.length,
        data: sanitizedData,
        message: `Successfully synced ${sanitizedData.length} items from Google Sheets`, 
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