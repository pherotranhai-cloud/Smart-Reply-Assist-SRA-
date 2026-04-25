import pg from 'pg';
import OpenAI from 'openai';

const { Pool } = pg;

export class VectorSearchService {
  private pool: pg.Pool;
  private openai: OpenAI;

  constructor(pool: pg.Pool) {
    this.pool = pool;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding || [];
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
        SELECT id, term, vi, en, zh_cn, zh_tw, id_lang, my,
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
