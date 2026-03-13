import { Handler } from '@netlify/functions';
import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL; // Không dùng NETLIFY_DATABASE_URL nữa vì bạn khai báo trên web là DATABASE_URL

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Trả lời các request kiểm tra (CORS Preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Chỉ cho phép GET request
  if (event.httpMethod !== 'GET') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  if (!DATABASE_URL) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Database connection string missing' })
    };
  }

  try {
    const client = await pool.connect();
    try {
      // Truy vấn toàn bộ từ vựng
      const result = await client.query('SELECT * FROM vocab ORDER BY created_at DESC');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows),
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Database Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch vocabulary', details: error.message }),
    };
  }
};