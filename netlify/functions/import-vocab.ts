import { Handler } from '@netlify/functions';
import mongoose from 'mongoose';
import crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI;

const VocabSchema = new mongoose.Schema({
  term: { type: String, required: true },
  meaningVi: { type: String, required: true },
  targetEn: String,
  targetZh: String,
  enabled: { type: Boolean, default: true },
  id: String, // Keep the client-side ID if provided
}, { timestamps: true });

const Vocab = mongoose.models.Vocab || mongoose.model('Vocab', VocabSchema);

let cachedDb: typeof mongoose | null = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  // Use connection caching to prevent pool exhaustion
  cachedDb = await mongoose.connect(MONGODB_URI);
  return cachedDb;
}

export const handler: Handler = async (event) => {
  // CORS headers for preflight and actual requests
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

  try {
    await connectToDatabase();
    
    const data = JSON.parse(event.body || '[]');

    if (!Array.isArray(data) || data.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or empty data array' }),
      };
    }

    // Filter out empty rows and ensure required fields
    const sanitizedData = data.filter(item => 
      item && 
      typeof item === 'object' && 
      item.term && 
      item.term.trim() !== '' &&
      item.meaningVi && 
      item.meaningVi.trim() !== ''
    ).map(item => ({
      term: item.term.trim(),
      meaningVi: item.meaningVi.trim(),
      targetEn: item.targetEn?.trim() || '',
      targetZh: item.targetZh?.trim() || '',
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

    // Optimized batch insertion
    await Vocab.insertMany(sanitizedData as any[], { ordered: false });

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
