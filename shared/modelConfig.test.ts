import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLAUDE_MODEL,
  TASK_CONFIG,
  buildRequest,
  extractText,
  extractUrlCitations,
  imageBlock,
  resolveModel,
} from './modelConfig';

describe('resolveModel', () => {
  it('defaults to Claude Sonnet 5.5', () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-sonnet-5-5');
    expect(resolveModel(undefined)).toBe('claude-sonnet-5-5');
    expect(resolveModel('')).toBe('claude-sonnet-5-5');
  });

  it('keeps an explicit Claude model id', () => {
    expect(resolveModel('claude-opus-5-5')).toBe('claude-opus-5-5');
  });

  it('replaces stale OpenAI ids from saved client settings or old env vars', () => {
    expect(resolveModel('gpt-5.6-luna')).toBe('claude-sonnet-5-5');
    expect(resolveModel('gpt-4o')).toBe('claude-sonnet-5-5');
    expect(resolveModel(42)).toBe('claude-sonnet-5-5');
  });
});

describe('buildRequest', () => {
  const base = { model: 'gpt-4o', system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }] };

  it('sends no sampling params and never disables thinking with type "disabled"', () => {
    for (const task of Object.keys(TASK_CONFIG) as (keyof typeof TASK_CONFIG)[]) {
      const req = buildRequest(task, base) as Record<string, any>;
      expect(req.model).toBe('claude-sonnet-5-5');
      expect(req.temperature).toBeUndefined();
      expect(req.top_p).toBeUndefined();
      expect(req.thinking.type).not.toBe('disabled');
      // between_tools is only accepted at effort high or below.
      if (req.thinking.type === 'between_tools') {
        expect(['low', 'medium', 'high']).toContain(req.output_config.effort);
      }
    }
  });

  it('enables the server-side refusal fallback', () => {
    const req = buildRequest('translate', base);
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toContain('server-side-fallback-2026-07-01');
  });

  it('adds a json_schema output format only when a schema is given', () => {
    expect(buildRequest('compose', base).output_config?.format).toBeUndefined();
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    expect(buildRequest('security-analyze', { ...base, jsonSchema: schema }).output_config?.format).toEqual({
      type: 'json_schema',
      schema,
    });
  });

  it('only attaches tools when some are given', () => {
    expect(buildRequest('expert-search', base).tools).toBeUndefined();
    const tools = [{ type: 'web_search_20260209' as const, name: 'web_search' as const }];
    expect(buildRequest('expert-search', { ...base, tools }).tools).toEqual(tools);
  });
});

describe('per-model request shape', () => {
  const base = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }] };

  it('Haiku 5.5: thinking off is "disabled" (no between_tools) and no server-side fallback', () => {
    const req = buildRequest('translate', { ...base, model: 'claude-haiku-5-5' }) as Record<string, any>;
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.thinking).toEqual({ type: 'disabled' });
    expect(['low', 'medium', 'high']).toContain(req.output_config.effort); // disabled needs effort <= high
    expect(req.fallbacks).toBeUndefined();
    expect(req.betas).toBeUndefined();
  });

  it('Haiku 5.5 keeps adaptive thinking where the task asks for it', () => {
    const req = buildRequest('expert-search', { ...base, model: 'claude-haiku-5-5' }) as Record<string, any>;
    expect(req.thinking).toEqual({ type: 'adaptive' });
  });

  it('Sonnet 5.5 (default) is unchanged', () => {
    const req = buildRequest('translate', { ...base, model: 'claude-sonnet-5-5' }) as Record<string, any>;
    expect(req.thinking).toEqual({ type: 'between_tools' });
    expect(req.fallbacks).toBe('default');
  });

  it('Opus 5.5 never sends a thinking-off mode it rejects', () => {
    const req = buildRequest('translate', { ...base, model: 'claude-opus-5-5' }) as Record<string, any>;
    expect(req.thinking).toEqual({ type: 'adaptive' });
    expect(req.fallbacks).toBe('default');
  });
});

describe('imageBlock', () => {
  it('turns a data URL into a base64 image block', () => {
    expect(imageBlock('data:image/jpeg;base64,QUJD')).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' },
    });
  });

  it('passes http(s) URLs by reference', () => {
    expect(imageBlock('https://example.com/a.png')).toEqual({
      type: 'image',
      source: { type: 'url', url: 'https://example.com/a.png' },
    });
  });

  it('rejects anything else', () => {
    expect(() => imageBlock('data:image/bmp;base64,AAAA')).toThrow();
  });
});

describe('response helpers', () => {
  const message = {
    content: [
      { type: 'thinking', thinking: '', signature: 's' },
      {
        type: 'text',
        text: 'Hello ',
        citations: [
          { type: 'web_search_result_location', url: 'https://a.example', title: 'A', cited_text: '', encrypted_index: '' },
          { type: 'web_search_result_location', url: 'https://a.example', title: 'A', cited_text: '', encrypted_index: '' },
        ],
      },
      { type: 'text', text: 'world', citations: null },
    ],
  } as any;

  it('joins text blocks and skips thinking blocks', () => {
    expect(extractText(message)).toBe('Hello world');
  });

  it('maps web search citations to the url_citation shape the UI renders, deduplicated', () => {
    expect(extractUrlCitations(message)).toEqual([
      { type: 'url_citation', url_citation: { url: 'https://a.example', title: 'A' } },
    ]);
  });
});
