import { describe, expect, it } from 'vitest';
import { buildLogText, chunkLog, chunkText, estimateTokens, hashContent } from './chunking';
import { LogClassification, LogRow } from './types';

describe('chunkText', () => {
  it('returns the text as a single chunk when it fits', () => {
    expect(chunkText('short text', 100, 10)).toEqual(['short text']);
  });

  it('splits long text into overlapping windows covering the whole string', () => {
    const text = 'x'.repeat(1000);
    const chunks = chunkText(text, 300, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk stays within the requested size.
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300);
    // The last chunk reaches the end of the text.
    expect(chunks[chunks.length - 1].endsWith('x')).toBe(true);
  });

  it('always makes forward progress even with a large overlap', () => {
    const text = 'y'.repeat(500);
    const chunks = chunkText(text, 100, 90);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(500); // would be ~500 if step could be <= 0
  });
});

describe('estimateTokens', () => {
  it('estimates roughly 4 characters per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('never returns zero for non-empty text', () => {
    expect(estimateTokens('a')).toBeGreaterThanOrEqual(1);
  });
});

describe('hashContent', () => {
  it('is deterministic and sensitive to any change', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
    expect(hashContent('hello')).not.toBe(hashContent('hello!'));
  });
});

const classification: LogClassification = { module: 'Translation', severity: 'none', issueType: null };

const shortLog: LogRow = {
  id: 42,
  created_at: '2026-03-01T08:00:00Z',
  task_type: 'translate',
  input_text: 'Check the machine.',
  output_text: 'Kiểm tra máy.',
  from_lang: 'auto',
  to_lang: 'Vietnamese',
};

describe('buildLogText', () => {
  it('embeds module, timestamp, languages, and both texts', () => {
    const text = buildLogText(shortLog, classification);
    expect(text).toContain('Module: Translation');
    expect(text).toContain('2026-03-01T08:00:00Z');
    expect(text).toContain('auto -> Vietnamese');
    expect(text).toContain('Check the machine.');
    expect(text).toContain('Kiểm tra máy.');
  });

  it('includes the flag line only when an issue was detected', () => {
    const flagged = buildLogText(shortLog, { module: 'Translation', severity: 'high', issueType: 'empty_response' });
    expect(flagged).toContain('Flag: empty_response (severity: high)');
    expect(buildLogText(shortLog, classification)).not.toContain('Flag:');
  });
});

describe('chunkLog', () => {
  it('produces exactly one chunk for a short log', () => {
    const chunks = chunkLog(shortLog, classification, { chunkCharSize: 3200, chunkOverlapChars: 400 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ logId: 42, chunkIndex: 0, module: 'Translation' });
    expect(chunks[0].contentHash).toBe(hashContent(chunks[0].content));
  });

  it('splits a long log into multiple indexed chunks', () => {
    const longLog: LogRow = { ...shortLog, output_text: 'y'.repeat(5000) };
    const chunks = chunkLog(longLog, classification, { chunkCharSize: 3200, chunkOverlapChars: 400 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => expect(chunk.chunkIndex).toBe(i));
  });
});
