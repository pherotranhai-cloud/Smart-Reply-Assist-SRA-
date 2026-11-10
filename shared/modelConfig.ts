import Anthropic from '@anthropic-ai/sdk';

/**
 * The one place every AI call this app makes is shaped and sent to Claude,
 * used by netlify/functions/api.ts (which server.ts also mounts as its API
 * router). Server-only: nothing in src/ imports it, and ANTHROPIC_API_KEY is
 * read here from process.env, never from the client bundle.
 */

/** The model every chat route uses unless a request or env var picks another Claude model. */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

/**
 * Accepts only Claude model ids. Anything else — a stale `gpt-*` id still
 * sitting in a user's saved settings, a leftover APP_ENGINE_ID from the
 * OpenAI era, an empty string — falls back to DEFAULT_CLAUDE_MODEL, because
 * forwarding it would just turn every request into a 404 from the API.
 */
export function resolveModel(requested?: unknown): string {
  if (typeof requested === 'string') {
    const id = requested.trim();
    if (id.startsWith('claude-')) return id;
  }
  return DEFAULT_CLAUDE_MODEL;
}

/** The default chat model for every route, overridable per-deploy with APP_ENGINE_ID. */
export const APP_ENGINE_ID = resolveModel(process.env.APP_ENGINE_ID);

export type ChatTask =
  | 'translate'
  | 'ocr'
  | 'compose'
  | 'expert-search'
  | 'security-analyze'
  | 'changelog';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface TaskConfig {
  max_tokens: number;
  /**
   * `between_tools` is how thinking is turned off on Claude Sonnet 5.5
   * (`{type: 'disabled'}` is a 400 there); it is only accepted at effort
   * `high` or below. `adaptive` lets the model decide how much to think.
   */
  thinking: { type: 'adaptive' } | { type: 'between_tools' };
  effort: Effort;
}

/**
 * Per-task settings. Latency-critical, single-shot tasks (OCR, translation,
 * compose, keyword extraction) run with thinking off; expert search, which
 * reasons over web results, keeps adaptive thinking.
 * No temperature/top_p: Claude Sonnet 5.5 rejects non-default sampling values.
 */
export const TASK_CONFIG: Record<ChatTask, TaskConfig> = {
  translate: { max_tokens: 16000, thinking: { type: 'between_tools' }, effort: 'medium' },
  ocr: { max_tokens: 8000, thinking: { type: 'between_tools' }, effort: 'low' },
  compose: { max_tokens: 4000, thinking: { type: 'between_tools' }, effort: 'medium' },
  'expert-search': { max_tokens: 16000, thinking: { type: 'adaptive' }, effort: 'medium' },
  'security-analyze': { max_tokens: 1024, thinking: { type: 'between_tools' }, effort: 'low' },
  // Release notes for the "what's new" popup (scripts/changelog.ts): offline,
  // so it can afford to think about which commits a user would notice.
  changelog: { max_tokens: 8000, thinking: { type: 'adaptive' }, effort: 'medium' },
};

export function taskConfig(task: ChatTask): TaskConfig {
  return TASK_CONFIG[task];
}

/**
 * Server-side refusal fallback: if a safety classifier declines a request,
 * the API re-runs it on a fallback model inside the same call instead of
 * returning an empty refusal.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let anthropicClient: Anthropic | null = null;

/**
 * Built lazily so a missing ANTHROPIC_API_KEY doesn't crash routes that never
 * call Claude (/health, /import-vocab, ...).
 */
export function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface ClaudeRequest {
  model: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaToolUnion[];
  /** JSON schema for structured output; the reply's text is then guaranteed to parse against it. */
  jsonSchema?: Record<string, unknown>;
}

/** Builds the full request body for `task` — exported so tests can check its shape without a network call. */
export function buildRequest(task: ChatTask, req: ClaudeRequest): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const cfg = TASK_CONFIG[task];
  const outputConfig: Anthropic.Beta.BetaOutputConfig = { effort: cfg.effort };
  if (req.jsonSchema) outputConfig.format = { type: 'json_schema', schema: req.jsonSchema };

  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: resolveModel(req.model),
    max_tokens: cfg.max_tokens,
    system: req.system,
    messages: req.messages,
    thinking: cfg.thinking,
    output_config: outputConfig,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  };
  if (req.tools && req.tools.length > 0) params.tools = req.tools;
  return params;
}

/** Concatenates every text block of a response, in order. */
export function extractText(message: Pick<Anthropic.Beta.BetaMessage, 'content'>): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function warnOnRefusal(task: ChatTask, message: Anthropic.Beta.BetaMessage) {
  if (message.stop_reason === 'refusal') {
    console.warn(
      `[modelConfig] ${task}: request declined by every model in the fallback chain (category=${message.stop_details?.category ?? 'n/a'}).`
    );
  }
}

/**
 * One non-streaming Claude call. A server tool such as web search can pause a
 * long turn (`stop_reason: 'pause_turn'`); the turn is resumed by sending the
 * paused assistant content back, up to `maxContinuations` times.
 */
export async function createMessage(
  client: Anthropic,
  task: ChatTask,
  req: ClaudeRequest,
  maxContinuations = 3
): Promise<Anthropic.Beta.BetaMessage> {
  const params = buildRequest(task, req);
  let message = await client.beta.messages.create(params);

  for (let i = 0; i < maxContinuations && message.stop_reason === 'pause_turn'; i++) {
    params.messages = [...params.messages, { role: 'assistant', content: message.content as any }];
    message = await client.beta.messages.create(params);
  }

  warnOnRefusal(task, message);
  return message;
}

/**
 * Starts a streamed Claude call and resolves once the HTTP response has
 * arrived (so connection/auth/validation errors surface here, before the
 * caller writes any SSE headers). The returned iterable yields text deltas
 * only; thinking and tool blocks are skipped.
 */
export async function streamText(
  client: Anthropic,
  task: ChatTask,
  req: ClaudeRequest
): Promise<AsyncIterable<string>> {
  const stream = await client.beta.messages.create({ ...buildRequest(task, req), stream: true });

  return (async function* () {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      } else if (event.type === 'message_delta' && event.delta.stop_reason === 'refusal') {
        console.warn(`[modelConfig] ${task}: streamed request declined by every model in the fallback chain.`);
      }
    }
  })();
}

/**
 * The client sends images as data URLs (see src/utils/imageResize.ts); Claude
 * takes them as base64 image blocks. Plain http(s) URLs are passed by URL.
 */
export function imageBlock(image: string): Anthropic.Beta.BetaImageBlockParam {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s.exec(image);
  if (match) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: match[2],
      },
    };
  }
  if (/^https?:\/\//i.test(image)) {
    return { type: 'image', source: { type: 'url', url: image } };
  }
  throw new Error('Unsupported image format: expected a JPEG/PNG/GIF/WebP data URL or an http(s) URL.');
}

/** A web-search citation in the `{type:'url_citation', url_citation:{url,title}}` shape the client UI renders. */
export interface UrlCitation {
  type: 'url_citation';
  url_citation: { url: string; title: string | null };
}

/** Collects the distinct web pages Claude cited in its text blocks. */
export function extractUrlCitations(message: Pick<Anthropic.Beta.BetaMessage, 'content'>): UrlCitation[] {
  const seen = new Set<string>();
  const out: UrlCitation[] = [];
  for (const block of message.content) {
    if (block.type !== 'text' || !block.citations) continue;
    for (const c of block.citations) {
      if (c.type !== 'web_search_result_location' || seen.has(c.url)) continue;
      seen.add(c.url);
      out.push({ type: 'url_citation', url_citation: { url: c.url, title: c.title } });
    }
  }
  return out;
}
