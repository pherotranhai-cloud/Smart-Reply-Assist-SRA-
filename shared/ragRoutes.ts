import { Router, Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { requireAdmin, secretsMatch } from './adminAuth';
import { answerChatQuestion } from './rag/chatService';
import { loadRagConfig, isRagConfigured } from './rag/config';
import { reportToDocxBuffer } from './rag/docxExport';
import { runIncrementalEmbeddingJob } from './rag/ingestion';
import { generateReport } from './rag/reportGenerator';
import { REPORT_TEMPLATES } from './rag/reportTemplates';
import { getEmbeddingStatus } from './rag/status';
import { Report, ReportTemplateId, SearchFilters } from './rag/types';

export const RAG_CRON_SECRET_HEADER = 'x-rag-cron-secret';

/** Body/query filters -> SearchFilters, dropping anything blank so a null filter reaches the DB, not an empty string. */
function parseFilters(raw: unknown): SearchFilters {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const filters: SearchFilters = {};
  for (const key of ['module', 'severity', 'issueType', 'from', 'to'] as const) {
    const value = src[key];
    if (typeof value === 'string' && value.trim()) filters[key] = value.trim();
  }
  return filters;
}

/**
 * Lets an external scheduler (Render Cron Job, GitHub Actions — see
 * docs/rag-admin-assistant.md) trigger the daily embedding run with a
 * dedicated RAG_CRON_SECRET instead of the human admin key, while every
 * other /admin/rag/* route still requires the normal admin key. Falls
 * through to requireAdmin when no cron secret is configured or presented,
 * so this route stays admin-gated by default rather than open.
 */
function requireAdminOrCronSecret(config: ReturnType<typeof loadRagConfig>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = req.get(RAG_CRON_SECRET_HEADER);
    if (config.cronSecret && provided && secretsMatch(provided, config.cronSecret)) {
      return next();
    }
    return requireAdmin(req, res, next);
  };
}

/**
 * Admin-only RAG endpoints, mounted at /admin/rag by both server.ts (via its
 * Netlify-fallback import) and netlify/functions/api.ts. `getOpenAI` is a
 * factory rather than a client so it can lazily build the client the same
 * way the rest of this codebase does (see netlify/functions/api.ts) instead
 * of constructing one eagerly at module load with a possibly-missing key.
 */
export function createRagRouter(supabase: SupabaseClient | null, getOpenAI: () => OpenAI): Router {
  const router = Router();
  const config = loadRagConfig();

  router.use((req, res, next) => {
    if (!isRagConfigured()) {
      return res.status(503).json({ error: 'RAG assistant is not configured: OPENAI_API_KEY is missing on the server.' });
    }
    if (!supabase) {
      return res.status(503).json({ error: 'RAG assistant is not configured: Supabase is not configured on the server.' });
    }
    next();
  });

  router.get('/templates', requireAdmin, (req, res) => {
    res.json({
      templates: Object.values(REPORT_TEMPLATES).map((t) => ({ id: t.id, title: t.title, description: t.description })),
    });
  });

  router.get('/embeddings/status', requireAdmin, async (req, res) => {
    try {
      res.json(await getEmbeddingStatus(supabase as SupabaseClient));
    } catch (err: any) {
      console.error('[ragRoutes] Failed to load embedding status:', err);
      res.status(500).json({ error: 'Failed to load embedding status' });
    }
  });

  router.post('/embeddings/run', requireAdminOrCronSecret(config), async (req, res) => {
    try {
      const trigger = req.get(RAG_CRON_SECRET_HEADER) ? 'external_cron' : 'manual';
      const result = await runIncrementalEmbeddingJob(supabase as SupabaseClient, getOpenAI(), config, trigger);
      res.json(result);
    } catch (err: any) {
      console.error('[ragRoutes] Manual/cron embedding run failed:', err);
      res.status(500).json({ error: 'Embedding run failed', details: err.message });
    }
  });

  router.post('/chat', requireAdmin, async (req, res) => {
    const { question, filters } = req.body || {};
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Missing question' });
    }
    try {
      const answer = await answerChatQuestion(supabase as SupabaseClient, getOpenAI(), config, question, parseFilters(filters));
      res.json(answer);
    } catch (err: any) {
      console.error('[ragRoutes] Chat failed:', err);
      res.status(500).json({ error: 'Chat failed', details: err.message });
    }
  });

  router.post('/report', requireAdmin, async (req, res) => {
    const { templateId, filters } = req.body || {};
    if (typeof templateId !== 'string' || !(templateId in REPORT_TEMPLATES)) {
      return res.status(400).json({ error: `templateId must be one of: ${Object.keys(REPORT_TEMPLATES).join(', ')}` });
    }
    try {
      const report = await generateReport(
        supabase as SupabaseClient,
        getOpenAI(),
        config,
        templateId as ReportTemplateId,
        parseFilters(filters)
      );
      res.json(report);
    } catch (err: any) {
      console.error('[ragRoutes] Report generation failed:', err);
      res.status(500).json({ error: 'Report generation failed', details: err.message });
    }
  });

  router.post('/report/export', requireAdmin, async (req, res) => {
    const { report } = req.body || {};
    if (!report || typeof report !== 'object' || !Array.isArray(report.sections)) {
      return res.status(400).json({ error: 'Missing or invalid report' });
    }
    try {
      const buffer = await reportToDocxBuffer(report as Report);
      const filename = `${(report.templateId || 'report').toString().replace(/[^a-z0-9-_]/gi, '_')}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error('[ragRoutes] Docx export failed:', err);
      res.status(500).json({ error: 'Export failed', details: err.message });
    }
  });

  return router;
}
