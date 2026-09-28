import { ConfidenceLevel, SearchResult, SourceRef } from './types';

/**
 * Confidence is derived from the retrieval scores actually used, not from
 * asking the LLM to grade itself — an average cosine similarity is a
 * reproducible number; a model's self-rated confidence is not.
 */
export function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

export function averageSimilarity(results: SearchResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
}

export function toSourceRefs(results: SearchResult[]): SourceRef[] {
  return results.map((r) => ({
    logId: r.logId,
    chunkIndex: r.chunkIndex,
    timestamp: r.logCreatedAt,
    module: r.module,
    similarity: Math.round(r.similarity * 1000) / 1000,
  }));
}
