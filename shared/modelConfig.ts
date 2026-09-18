import type OpenAI from 'openai';

/**
 * Model id + per-task tuning for every OpenAI chat completion call this app
 * makes, shared by both server.ts (Express) and netlify/functions/api.ts
 * (which server.ts also dynamically imports as its "Netlify fallback
 * router" — see server.ts). Before this file existed, APP_ENGINE_ID was
 * defined once in api.ts and then ignored by four of its six routes, which
 * hardcoded the model id literal instead; setting APP_ENGINE_ID in the
 * environment therefore only ever redirected /translate and /compose.
 *
 * Unlike shared/vocabNormalize.ts, this module is never bundled for the
 * browser (nothing in src/ imports it), so Node APIs would be fine here if
 * needed. None are currently required.
 */

/** The default chat model for every route, overridable per-deploy. */
export const APP_ENGINE_ID = process.env.APP_ENGINE_ID || 'gpt-5.6-luna';

export type ChatTask =
  | 'translate'
  | 'ocr'
  | 'talk'
  | 'compose'
  | 'expert-search'
  | 'security-analyze';

/**
 * Optional, model-tunable knobs layered onto a chat completion request.
 * Never put a required field here (model, messages, stream, tools) — only
 * things createChatCompletion is allowed to drop and retry without, because
 * that is exactly what it does when a model rejects one of them.
 */
export interface ChatTuning {
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

const JSON_OBJECT_RESPONSE: ChatTuning = { response_format: { type: 'json_object' } };

/**
 * /talk's original sampling knobs (top_p/presence_penalty/frequency_penalty),
 * kept for models whose full parameter surface is public and already known
 * to accept them.
 */
const TALK_SAMPLING_KNOBS: ChatTuning = {
  top_p: 0.8,
  presence_penalty: 0,
  frequency_penalty: 0,
  max_tokens: 80,
};

/**
 * /talk's only knob kept for a model of unverified parameter surface:
 * max_tokens bounds a latency-critical spoken reply and was already in
 * production use and already working. top_p/presence_penalty/frequency_penalty
 * are dropped for such a model rather than carried over on faith — see the
 * file header on APP_ENGINE_ID's default.
 */
const TALK_LATENCY_CAP: ChatTuning = { max_tokens: 80 };

/**
 * Per-model, per-task tuning. Gpt-5.6-luna's supported parameter surface
 * cannot be verified from this environment (no OPENAI_API_KEY, see repo
 * memory.md §6), so its entry stays deliberately bare: nothing optional goes
 * out except the one knob that was already live and already working.
 * gpt-4o and gpt-3.5-turbo are documented OpenAI models, so they keep the
 * fuller, previously-hardcoded /talk knobs.
 */
export const MODEL_TUNING: Record<string, Partial<Record<ChatTask, ChatTuning>>> = {
  'gpt-5.6-luna': {
    talk: TALK_LATENCY_CAP,
    'security-analyze': JSON_OBJECT_RESPONSE,
  },
  'gpt-4o': {
    talk: TALK_SAMPLING_KNOBS,
    'security-analyze': JSON_OBJECT_RESPONSE,
  },
  'gpt-3.5-turbo': {
    talk: TALK_SAMPLING_KNOBS,
    'security-analyze': JSON_OBJECT_RESPONSE,
  },
};

/**
 * A model id this table has never heard of (a bad client override, a future
 * addition to SUPPORTED_MODELS in src/constants.ts that this file has not
 * caught up with yet) falls back to the gpt-5.6-luna entry — an unlisted
 * model is exactly the case where guessing at its parameter surface is
 * riskiest, so it gets the conservative table, not the generous one.
 */
export function tuningFor(model: string, task: ChatTask): ChatTuning {
  const table = MODEL_TUNING[model] ?? MODEL_TUNING['gpt-5.6-luna'];
  return table[task] ?? {};
}

/**
 * Phrasings OpenAI (and OpenAI-compatible gateways) have been observed to use
 * for "this model doesn't accept that field", checked against a lowercased,
 * underscore-flattened haystack built from every text field a 400 error might
 * carry it in. Matched defensively and broadly on purpose: the alternative to
 * over-matching here is a dead feature (see createChatCompletion below), and
 * the alternative to under-matching is retrying a request that will fail for
 * an unrelated reason — cheap, once, and ruled out by the status===400 gate.
 */
const UNSUPPORTED_PARAM_PHRASES = [
  'unsupported parameter',
  'unknown parameter',
  'unrecognized request argument',
  'is not supported with this model',
  'not supported for this model',
];

interface RetryableErrorLike {
  status?: number;
  message?: string;
  code?: string | null;
  param?: string | null;
  type?: string | null;
  error?: { message?: string; code?: string; param?: string; type?: string } | null;
}

/**
 * Returns a short description of the match for logging, or null if `err`
 * is not a 400 whose text names an unsupported/unknown request parameter.
 */
function unsupportedParameterReason(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as RetryableErrorLike;
  if (e.status !== 400) return null;

  const fields = [e.message, e.code, e.param, e.type, e.error?.message, e.error?.code, e.error?.param, e.error?.type];
  const raw = fields.filter((f): f is string => typeof f === 'string' && f.length > 0).join(' | ');
  if (!raw) return null;

  // Underscore -> space so 'unsupported_parameter' (a likely error `code`)
  // matches the same phrase list as the prose in `message`.
  const haystack = raw.toLowerCase().replace(/_/g, ' ');
  const matched = UNSUPPORTED_PARAM_PHRASES.some((phrase) => haystack.includes(phrase));
  return matched ? raw : null;
}

/**
 * Wraps openai.chat.completions.create with one degrade-and-retry: if the
 * model rejects an optional tuning parameter (a 400 naming it as unsupported/
 * unknown/unrecognized), the same request is sent again with `tuning` fully
 * stripped, so a knob the model doesn't support degrades the call instead of
 * breaking it. Any other error (auth, rate limit, 5xx, a bad required field)
 * is rethrown as-is — retrying those would just fail the same way twice.
 *
 * `params` must already be the complete, non-optional request (model,
 * messages, stream, tools, ...); `tuning` holds only the knobs that are safe
 * to drop. The retry, when it happens, happens on the `create()` call itself,
 * before either response is iterated — so it is safe to use for a streamed
 * call (stream: true in `params`) as long as the caller has not started
 * reading the first attempt's stream yet. This function never reads a
 * stream it returns; a streaming result comes back exactly as
 * openai.chat.completions.create produced it, unconsumed.
 */
export async function createChatCompletion(
  openai: OpenAI,
  params: Record<string, any>,
  tuning: ChatTuning = {}
): Promise<any> {
  const hasTuning = Object.keys(tuning).length > 0;
  const request = hasTuning ? { ...params, ...tuning } : params;

  try {
    return await openai.chat.completions.create(request as any);
  } catch (err) {
    // Nothing optional was sent, so a retry would be byte-for-byte the same
    // request — let the caller's own error handling deal with it.
    if (!hasTuning) throw err;

    const reason = unsupportedParameterReason(err);
    if (!reason) throw err;

    console.warn(
      `[modelConfig] ${String(params.model ?? 'unknown model')} rejected an optional chat parameter (${reason}); retrying once without tuning.`
    );
    return await openai.chat.completions.create(params as any);
  }
}
