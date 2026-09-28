import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { createChatCompletion, tuningFor } from '../modelConfig';
import { RagConfig } from './config';
import { averageSimilarity, scoreToLevel, toSourceRefs } from './confidence';
import { getReportTemplate } from './reportTemplates';
import { LogStatRow, Report, ReportTemplateId, SearchFilters, SearchResult } from './types';
import { mergeSearchResults, semanticSearch } from './vectorSearch';

async function computeStats(
  supabase: SupabaseClient,
  filters: SearchFilters
): Promise<LogStatRow[]> {
  const { data, error } = await (supabase as any).rpc('log_embedding_stats', {
    filter_from: filters.from || null,
    filter_to: filters.to || null,
  });
  if (error) throw new Error(`Failed to compute log stats: ${error.message}`);
  return ((data || []) as any[]).map((row) => ({
    module: row.module,
    severity: row.severity,
    issueType: row.issue_type,
    logCount: Number(row.log_count),
  }));
}

async function retrieveSources(
  supabase: SupabaseClient,
  openai: OpenAI,
  queries: string[],
  filters: SearchFilters,
  config: RagConfig
): Promise<SearchResult[]> {
  const perQueryTopK = Math.max(3, Math.ceil((config.searchTopK * 2) / queries.length));
  const resultSets = await Promise.all(
    queries.map((query) =>
      semanticSearch(supabase, openai, query, { embeddingModel: config.embeddingModel, topK: perQueryTopK, filters })
    )
  );
  return mergeSearchResults(resultSets).slice(0, config.searchTopK * 2);
}

function buildContextBlock(stats: LogStatRow[], sources: SearchResult[]): string {
  const statsText = stats.length
    ? stats
        .map((s) => `- module=${s.module ?? 'n/a'} severity=${s.severity ?? 'n/a'} issue_type=${s.issueType ?? 'n/a'} log_count=${s.logCount}`)
        .join('\n')
    : '(no matching logs in the selected date range)';

  const excerptsText = sources.length
    ? sources
        .map((s, i) => `[${i + 1}] similarity=${s.similarity.toFixed(2)}\n${s.content}`)
        .join('\n\n')
    : '(no semantically relevant log excerpts were found)';

  return `STATS (grouped log counts; the ONLY source of truth for any number in this report):\n${statsText}\n\nSOURCE EXCERPTS (numbered; cite as [n] when referencing one):\n${excerptsText}`;
}

interface LlmReportBody {
  summary: string;
  sections: { heading: string; content: string }[];
}

async function generateReportBody(
  openai: OpenAI,
  config: RagConfig,
  templateTitle: string,
  templateDescription: string,
  sectionInstructions: { heading: string; instruction: string }[],
  contextBlock: string
): Promise<LlmReportBody> {
  const systemPrompt = `You are an operations analyst writing an internal report from a factory-floor AI assistant's request logs, in the same house style as this organization's own production/efficiency reports: specific, numbers-first, and structured around named issues rather than general prose.

Ground rules:
1. You MUST base every claim strictly on the STATS and SOURCE EXCERPTS given to you — never on general knowledge or assumption. If the data is insufficient to support a claim, say so explicitly instead of inventing one.
2. Every number you write (a count, a percentage, a rate) must come from STATS or be a literal count of items you can point to in the SOURCE EXCERPTS. Never write a vague magnitude ("a significant number", "several", "many") when an exact count is available — use the exact count.
3. Name specifics wherever the evidence has them: the exact module, the exact timestamp, a short quote from the excerpt. A sentence that could be copy-pasted into any report without changing a word is not acceptable — anchor every sentence to a fact from this data.
4. When you reference a specific log, cite its excerpt number like [2].
5. Follow each section's own formatting instruction exactly, including the numbered "Cause:" / "Impact:" structure where one is requested.

Respond with a single JSON object: {"summary": string, "sections": [{"heading": string, "content": string}]}. Produce exactly one section per heading requested, in the same order, using the exact heading text given.`;

  const userPrompt = `REPORT: ${templateTitle}\n${templateDescription}\n\n${contextBlock}\n\nSECTIONS TO WRITE:\n${sectionInstructions
    .map((s, i) => `${i + 1}. "${s.heading}": ${s.instruction}`)
    .join('\n')}`;

  const response = await createChatCompletion(
    openai,
    {
      model: config.chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    tuningFor(config.chatModel, 'rag-report')
  );

  const raw = response.choices[0]?.message?.content ?? '{}';
  let parsed: LlmReportBody;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { summary: raw, sections: [] };
  }
  if (!Array.isArray(parsed.sections)) parsed.sections = [];
  return parsed;
}

/**
 * Generates one of the three preset reports: pulls grouped stats + the most
 * relevant log excerpts (never the whole table), then asks the model to
 * write the report strictly from that context. Every section shares the
 * same source list — the report as a whole carries its own confidence,
 * derived from the retrieval scores actually used, not a self-rating.
 */
export async function generateReport(
  supabase: SupabaseClient,
  openai: OpenAI,
  config: RagConfig,
  templateId: ReportTemplateId,
  filters: SearchFilters = {}
): Promise<Report> {
  const template = getReportTemplate(templateId);

  const [stats, sources] = await Promise.all([
    computeStats(supabase, filters),
    retrieveSources(supabase, openai, template.semanticQueries, filters, config),
  ]);

  const contextBlock = buildContextBlock(stats, sources);
  const body = await generateReportBody(
    openai,
    config,
    template.title,
    template.description,
    template.sections,
    contextBlock
  );

  const sourceRefs = toSourceRefs(sources);
  const confidence = scoreToLevel(averageSimilarity(sources));

  const sections =
    body.sections.length > 0
      ? body.sections.map((s) => ({ heading: s.heading, content: s.content, sources: sourceRefs }))
      : template.sections.map((s) => ({ heading: s.heading, content: '(no content generated)', sources: sourceRefs }));

  return {
    templateId,
    title: template.title,
    generatedAt: new Date().toISOString(),
    filters,
    summary: body.summary || '(no summary generated)',
    sections,
    stats,
    sources: sourceRefs,
    confidence,
  };
}
