import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Send,
  FileText,
  Download,
  RefreshCw,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  ChevronDown,
  Database,
} from 'lucide-react';

const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';

// --- Types (kept local to the frontend rather than importing shared/rag/types,
// which is a server-only module tree — see shared/modelConfig.ts's own note
// on why nothing under src/ imports from shared/). ---

interface SourceRef {
  logId: number;
  chunkIndex: number;
  timestamp: string | null;
  module: string | null;
  similarity: number;
}

type ConfidenceLevel = 'low' | 'medium' | 'high';

interface ChatAnswer {
  answer: string;
  sources: SourceRef[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  usedFallback: boolean;
}

interface ChatTurn {
  question: string;
  answer?: ChatAnswer;
  error?: string;
  loading?: boolean;
}

type ReportTemplateId = 'performance-impact' | 'quality-impact' | 'standards-issues';

interface ReportSection {
  heading: string;
  content: string;
  sources: SourceRef[];
}

interface LogStatRow {
  module: string | null;
  severity: string | null;
  issueType: string | null;
  logCount: number;
}

interface Report {
  templateId: ReportTemplateId;
  title: string;
  generatedAt: string;
  summary: string;
  sections: ReportSection[];
  stats: LogStatRow[];
  sources: SourceRef[];
  confidence: ConfidenceLevel;
}

interface EmbeddingStatus {
  totalLogs: number;
  embeddedLogs: number;
  pendingLogs: number;
  lastRun: {
    trigger: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    logsScanned: number;
    logsEmbedded: number;
    logsFailed: number;
    chunksCreated: number;
    errorMessage: string | null;
  } | null;
  unresolvedErrorCount: number;
}

interface Filters {
  module: string;
  severity: string;
  issueType: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { module: '', severity: '', issueType: '', from: '', to: '' };

const REPORT_TEMPLATES: { id: ReportTemplateId; title: string; description: string }[] = [
  { id: 'performance-impact', title: 'Performance Impact Report', description: 'Volume, latency and failure signals by module.' },
  { id: 'quality-impact', title: 'Quality Impact Report', description: 'Mistranslation, truncation and terminology concerns.' },
  { id: 'standards-issues', title: 'Standards and Issues Report', description: 'Errors, empty responses and flagged deviations.' },
];

function filtersToPayload(filters: Filters) {
  const payload: Record<string, string> = {};
  (Object.keys(filters) as (keyof Filters)[]).forEach((key) => {
    if (filters[key].trim()) payload[key] = filters[key].trim();
  });
  return payload;
}

const confidenceStyle: Record<ConfidenceLevel, string> = {
  high: 'bg-green-500/10 text-green-500 border-green-500/30',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  low: 'bg-red-500/10 text-red-500 border-red-500/30',
};

const ConfidenceBadge: React.FC<{ level: ConfidenceLevel }> = ({ level }) => (
  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${confidenceStyle[level]}`}>
    Confidence: {level}
  </span>
);

const SourceList: React.FC<{ sources: SourceRef[] }> = ({ sources }) => {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span
          key={`${s.logId}-${s.chunkIndex}-${i}`}
          title={`Similarity: ${s.similarity.toFixed(2)}`}
          className="text-[11px] font-mono bg-bg-input border border-border-main rounded-md px-1.5 py-0.5 text-text-muted"
        >
          #{s.logId} · {s.module || 'n/a'} · {s.timestamp ? new Date(s.timestamp).toLocaleString('vi-VN') : 'n/a'}
        </span>
      ))}
    </div>
  );
};

interface FiltersPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const FiltersPanel: React.FC<FiltersPanelProps> = ({ filters, onChange }) => {
  const [open, setOpen] = useState(false);
  const set = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value });

  return (
    <div className="border border-border-main rounded-xl bg-panel">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-text-muted"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} /> Filters (optional)
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 p-3 pt-0 text-xs">
          <input
            placeholder="Module (e.g. Translation)"
            value={filters.module}
            onChange={(e) => set('module', e.target.value)}
            className="col-span-2 bg-bg-input border border-border-main rounded-lg px-2 py-1.5 text-text-main"
          />
          <input
            placeholder="Severity (none/low/medium/high)"
            value={filters.severity}
            onChange={(e) => set('severity', e.target.value)}
            className="bg-bg-input border border-border-main rounded-lg px-2 py-1.5 text-text-main"
          />
          <input
            placeholder="Issue type"
            value={filters.issueType}
            onChange={(e) => set('issueType', e.target.value)}
            className="bg-bg-input border border-border-main rounded-lg px-2 py-1.5 text-text-main"
          />
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(e) => set('from', e.target.value)}
            className="bg-bg-input border border-border-main rounded-lg px-2 py-1.5 text-text-main"
          />
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(e) => set('to', e.target.value)}
            className="bg-bg-input border border-border-main rounded-lg px-2 py-1.5 text-text-main"
          />
        </div>
      )}
    </div>
  );
};

interface EmbeddingStatusWidgetProps {
  authHeaders: Record<string, string>;
}

const EmbeddingStatusWidget: React.FC<EmbeddingStatusWidgetProps> = ({ authHeaders }) => {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/rag/embeddings/status`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/rag/embeddings/run`, { method: 'POST', headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (e: any) {
      setError(e.message || 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const coveragePct = status && status.totalLogs > 0 ? Math.round((status.embeddedLogs / status.totalLogs) * 100) : 0;

  return (
    <div className="bg-panel border border-border-main rounded-xl p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 font-semibold text-text-main">
          <Database size={13} className="text-accent" /> Embedding index
        </span>
        <button
          onClick={handleRunNow}
          disabled={running || loading}
          className="flex items-center gap-1 text-[11px] font-semibold text-accent disabled:opacity-50"
        >
          <RefreshCw size={12} className={running ? 'animate-spin' : ''} /> Run now
        </button>
      </div>
      {loading ? (
        <p className="text-text-muted">Loading…</p>
      ) : error ? (
        <p className="text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>
      ) : status ? (
        <div className="space-y-1 text-text-muted">
          <div className="flex justify-between">
            <span>Indexed</span>
            <span className="text-text-main font-mono">
              {status.embeddedLogs} / {status.totalLogs} ({coveragePct}%)
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-bg-input overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${coveragePct}%` }} />
          </div>
          <div className="flex justify-between">
            <span>Pending</span>
            <span className="text-text-main font-mono">{status.pendingLogs}</span>
          </div>
          {status.unresolvedErrorCount > 0 && (
            <div className="flex justify-between text-yellow-500">
              <span>Unresolved errors</span>
              <span className="font-mono">{status.unresolvedErrorCount}</span>
            </div>
          )}
          {status.lastRun && (
            <div className="pt-1 border-t border-border-main mt-1">
              Last run ({status.lastRun.trigger ?? 'n/a'}): <span className="text-text-main">{status.lastRun.status}</span>
              {' — '}
              {status.lastRun.logsEmbedded} embedded, {status.lastRun.logsFailed} failed
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

interface RagAssistantProps {
  adminKey: string;
}

/**
 * AI Log Assistant: a chatbot over app_logs (semantic search + grounded
 * chat completion, shared/rag/*) plus the three preset reports, each
 * exportable to .docx. Mounted as a third section of AdminDashboard.
 */
export const RagAssistant: React.FC<RagAssistantProps> = ({ adminKey }) => {
  const [mode, setMode] = useState<'chat' | 'reports'>('chat');
  const authHeaders = useMemo(
    () => ({ 'x-admin-key': adminKey, 'Content-Type': 'application/json' }),
    [adminKey]
  );

  // --- Chat state ---
  const [question, setQuestion] = useState('');
  const [chatFilters, setChatFilters] = useState<Filters>(EMPTY_FILTERS);
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    setTurns((prev) => [...prev, { question: q, loading: true }]);

    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/rag/chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ question: q, filters: filtersToPayload(chatFilters) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { question: q, answer: data } : t)));
    } catch (e: any) {
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { question: q, error: e.message || 'Chat failed' } : t)));
    }
  };

  // --- Reports state ---
  const [reportLoading, setReportLoading] = useState<ReportTemplateId | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportFilters, setReportFilters] = useState<Filters>(EMPTY_FILTERS);
  const [exporting, setExporting] = useState(false);

  const handleGenerateReport = async (templateId: ReportTemplateId) => {
    setReportLoading(templateId);
    setReportError(null);
    setReport(null);
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/rag/report`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ templateId, filters: filtersToPayload(reportFilters) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (e: any) {
      setReportError(e.message || 'Report generation failed');
    } finally {
      setReportLoading(null);
    }
  };

  const handleExportDocx = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/rag/report/export`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ report }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.templateId}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setReportError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section>
      <div className="flex justify-between items-center gap-3 mb-4">
        <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
          <Bot size={20} className="text-accent" />
          AI Log Assistant
        </h3>
        <div className="flex gap-1 bg-panel border border-border-main rounded-full p-0.5">
          <button
            onClick={() => setMode('chat')}
            className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${mode === 'chat' ? 'bg-accent text-white' : 'text-text-muted'}`}
          >
            Chat
          </button>
          <button
            onClick={() => setMode('reports')}
            className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${mode === 'reports' ? 'bg-accent text-white' : 'text-text-muted'}`}
          >
            Reports
          </button>
        </div>
      </div>

      <div className="mb-3">
        <EmbeddingStatusWidget authHeaders={authHeaders} />
      </div>

      {mode === 'chat' ? (
        <div className="space-y-3">
          <FiltersPanel filters={chatFilters} onChange={setChatFilters} />

          <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-1">
            {turns.length === 0 && (
              <p className="text-center text-xs text-text-muted bg-panel border border-border-main rounded-xl p-4">
                Ask about historical logs, e.g. "Were there any translation errors on line 3 last week?"
              </p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className="space-y-1.5">
                <div className="self-end bg-accent/10 border border-accent/30 rounded-xl px-3 py-2 text-sm text-text-main ml-auto max-w-[85%]">
                  {turn.question}
                </div>
                <div className="bg-panel border border-border-main rounded-xl px-3 py-2 text-sm text-text-main max-w-[95%]">
                  {turn.loading ? (
                    <span className="flex items-center gap-2 text-text-muted text-xs">
                      <Loader2 size={13} className="animate-spin" /> Searching logs…
                    </span>
                  ) : turn.error ? (
                    <span className="text-red-500 text-xs flex items-center gap-1">
                      <AlertTriangle size={12} /> {turn.error}
                    </span>
                  ) : turn.answer ? (
                    <>
                      <div className="prose-sm max-w-none [&_p]:my-1">
                        <Markdown remarkPlugins={[remarkGfm]}>{turn.answer.answer}</Markdown>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ConfidenceBadge level={turn.answer.confidence} />
                      </div>
                      <SourceList sources={turn.answer.sources} />
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder="Ask about historical logs…"
              className="flex-1 bg-bg-input border border-border-main rounded-full px-4 py-2 text-sm text-text-main"
            />
            <button
              onClick={handleAsk}
              disabled={!question.trim()}
              className="p-2.5 bg-accent rounded-full text-white disabled:opacity-40"
              aria-label="Send question"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <FiltersPanel filters={reportFilters} onChange={setReportFilters} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {REPORT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => handleGenerateReport(tpl.id)}
                disabled={reportLoading !== null}
                className="text-left bg-panel border border-border-main rounded-xl p-3 hover:bg-border-main/20 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold text-text-main">
                  {reportLoading === tpl.id ? <Loader2 size={14} className="animate-spin text-accent" /> : <FileText size={14} className="text-accent" />}
                  {tpl.title}
                </div>
                <p className="text-[11px] text-text-muted mt-1">{tpl.description}</p>
              </button>
            ))}
          </div>

          {reportError && (
            <p className="text-red-500 text-xs flex items-center gap-1 bg-panel border border-border-main rounded-xl px-3 py-2">
              <AlertTriangle size={12} /> {reportError}
            </p>
          )}

          {report && (
            <div className="bg-panel border border-border-main rounded-xl p-4 space-y-3 max-h-[55vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-text-main">{report.title}</h4>
                  <p className="text-[11px] text-text-muted">
                    Generated {new Date(report.generatedAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <button
                  onClick={handleExportDocx}
                  disabled={exporting}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-accent text-white rounded-full px-3 py-1.5 disabled:opacity-50 shrink-0"
                >
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Export .docx
                </button>
              </div>

              <ConfidenceBadge level={report.confidence} />

              <div className="prose-sm max-w-none [&_p]:my-1 text-sm text-text-main">
                <Markdown remarkPlugins={[remarkGfm]}>{report.summary}</Markdown>
              </div>

              {report.sections.map((section, i) => (
                <div key={i} className="border-t border-border-main pt-2">
                  <h5 className="text-sm font-bold text-text-main mb-1">{section.heading}</h5>
                  <div className="prose-sm max-w-none [&_p]:my-1 text-sm text-text-main">
                    <Markdown remarkPlugins={[remarkGfm]}>{section.content}</Markdown>
                  </div>
                </div>
              ))}

              {report.sources.length > 0 && (
                <div className="border-t border-border-main pt-2">
                  <h5 className="text-sm font-bold text-text-main mb-1">Sources</h5>
                  <SourceList sources={report.sources} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
