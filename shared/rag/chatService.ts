import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { createChatCompletion, tuningFor } from '../modelConfig';
import { RagConfig } from './config';
import { averageSimilarity, scoreToLevel, toSourceRefs } from './confidence';
import { ChatAnswer, SearchFilters } from './types';
import { semanticSearch } from './vectorSearch';

const SYSTEM_PROMPT = `You are an internal admin assistant answering questions about a factory-floor AI assistant's historical request logs (translations, compositions, OCR, voice, expert search). You are given a set of retrieved log excerpts as your ONLY source of information — you have no other knowledge of this data. Rules:
1. Answer ONLY using the excerpts provided. Never use general knowledge, and never invent a log, timestamp, module, or number that is not in the excerpts.
2. If the excerpts do not contain enough information to answer, say so plainly instead of guessing.
3. When you state a fact from an excerpt, cite it like [2] using the excerpt's number.
4. Be concise and factual — this is an operational report, not a conversation.`;

/**
 * Answers one admin question by retrieving the most relevant log chunks
 * (optionally filtered by module/severity/issue type/date) and asking the
 * model to answer strictly from that context. Confidence is derived from
 * the retrieval scores, not a model self-rating (see shared/rag/confidence.ts).
 */
export async function answerChatQuestion(
  supabase: SupabaseClient,
  openai: OpenAI,
  config: RagConfig,
  question: string,
  filters: SearchFilters = {}
): Promise<ChatAnswer> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: 'Please ask a question about the logs.', sources: [], confidence: 'low', confidenceScore: 0, usedFallback: true };
  }

  const results = await semanticSearch(supabase, openai, trimmed, {
    embeddingModel: config.embeddingModel,
    topK: config.searchTopK,
    filters,
  });

  if (results.length === 0) {
    return {
      answer: 'No log data matching this question (or the selected filters) was found. Try broadening the filters or rephrasing the question.',
      sources: [],
      confidence: 'low',
      confidenceScore: 0,
      usedFallback: true,
    };
  }

  const excerptsText = results
    .map((r, i) => `[${i + 1}] module=${r.module ?? 'n/a'} timestamp=${r.logCreatedAt ?? 'n/a'} similarity=${r.similarity.toFixed(2)}\n${r.content}`)
    .join('\n\n');

  const response = await createChatCompletion(
    openai,
    {
      model: config.chatModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `QUESTION: ${trimmed}\n\nRETRIEVED LOG EXCERPTS:\n${excerptsText}` },
      ],
    },
    tuningFor(config.chatModel, 'rag-chat')
  );

  const answer = response.choices[0]?.message?.content?.trim() || '(no answer generated)';
  const score = averageSimilarity(results);

  return {
    answer,
    sources: toSourceRefs(results),
    confidence: scoreToLevel(score),
    confidenceScore: Math.round(score * 1000) / 1000,
    usedFallback: false,
  };
}
