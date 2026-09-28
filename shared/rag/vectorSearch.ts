import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { embedTexts } from './embeddings';
import { SearchFilters, SearchResult } from './types';

/**
 * Normalizes UI-supplied filters into the null-coalesced params
 * match_log_embeddings expects (a SQL `null` means "don't filter on this").
 * Pure and exported so the mapping can be unit-tested without a DB call.
 */
export function buildMatchParams(
  queryEmbedding: number[],
  matchCount: number,
  filters?: SearchFilters
) {
  return {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_module: filters?.module || null,
    filter_severity: filters?.severity || null,
    filter_issue_type: filters?.issueType || null,
    filter_from: filters?.from || null,
    filter_to: filters?.to || null,
  };
}

export interface SemanticSearchOptions {
  embeddingModel: string;
  topK: number;
  filters?: SearchFilters;
}

/**
 * Embeds `query` and runs match_log_embeddings for the nearest chunks,
 * optionally narrowed by module/severity/issue type/date range. This is the
 * only place a log's full text reaches the LLM: at most `topK` short chunks,
 * never the whole table — the mechanism that keeps the chatbot and report
 * generator inside the model's context window regardless of how many rows
 * app_logs holds.
 */
export async function semanticSearch(
  supabase: SupabaseClient,
  openai: OpenAI,
  query: string,
  opts: SemanticSearchOptions
): Promise<SearchResult[]> {
  const [queryEmbedding] = await embedTexts(openai, [query], {
    model: opts.embeddingModel,
    batchSize: 1,
    maxRetries: 3,
  });

  const params = buildMatchParams(queryEmbedding, opts.topK, opts.filters);
  const { data, error } = await (supabase as any).rpc('match_log_embeddings', params);
  if (error) throw new Error(`Vector search failed: ${error.message}`);

  return ((data || []) as any[]).map((row) => ({
    id: row.id,
    logId: row.log_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    module: row.module,
    severity: row.severity,
    issueType: row.issue_type,
    fromLang: row.from_lang,
    toLang: row.to_lang,
    logCreatedAt: row.log_created_at,
    similarity: row.similarity,
  }));
}

/** De-duplicates search results pulled from several queries (report generation issues a few), keeping the highest similarity seen for each chunk. */
export function mergeSearchResults(resultSets: SearchResult[][]): SearchResult[] {
  const byId = new Map<number, SearchResult>();
  for (const results of resultSets) {
    for (const result of results) {
      const existing = byId.get(result.id);
      if (!existing || result.similarity > existing.similarity) byId.set(result.id, result);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.similarity - a.similarity);
}
