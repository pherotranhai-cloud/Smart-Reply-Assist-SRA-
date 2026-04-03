import pg from 'pg';
import { GoogleGenAI } from '@google/genai';
// Assuming OpenAI is also available if needed, but we'll use Gemini for embeddings by default or based on env.

const { Pool } = pg;

export class VectorSearchService {
  private pool: pg.Pool;
  private ai: GoogleGenAI;

  constructor(pool: pg.Pool) {
    this.pool = pool;
    // Initialize Gemini for embeddings
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: text,
      });
      // Gemini embeddings are 768 dimensions.
      // If the DB is set to 1536, we might need to pad it, or better, alter the DB to 768 if we use Gemini.
      // Let's assume the DB is 768 for Gemini.
      return result.embeddings?.[0]?.values || [];
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }

  async updateVocabEmbedding(id: string, text: string) {
    const embedding = await this.generateEmbedding(text);
    if (embedding.length > 0) {
      const client = await this.pool.connect();
      try {
        // pgvector uses JSON array format for inserts
        const embeddingString = `[${embedding.join(',')}]`;
        await client.query(
          'UPDATE vocab SET embedding = $1 WHERE id = $2',
          [embeddingString, id]
        );
      } finally {
        client.release();
      }
    }
  }

  async findSimilarTerms(text: string, limit: number = 5, threshold: number = 0.7): Promise<any[]> {
    const embedding = await this.generateEmbedding(text);
    if (embedding.length === 0) return [];

    const client = await this.pool.connect();
    try {
      const embeddingString = `[${embedding.join(',')}]`;
      // Use cosine similarity (<=>)
      // cosine distance = 1 - cosine similarity. So distance < 0.3 means similarity > 0.7
      const distanceThreshold = 1 - threshold;
      
      const result = await client.query(`
        SELECT id, term, meaning_vi, target_en, target_zh, 
               1 - (embedding <=> $1) as similarity
        FROM vocab
        WHERE embedding IS NOT NULL AND (embedding <=> $1) < $2
        ORDER BY embedding <=> $1
        LIMIT $3
      `, [embeddingString, distanceThreshold, limit]);

      return result.rows;
    } finally {
      client.release();
    }
  }
}
