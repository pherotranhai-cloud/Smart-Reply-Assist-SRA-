import { describe, expect, it } from 'vitest';
import { averageSimilarity, scoreToLevel, toSourceRefs } from './confidence';
import { SearchResult } from './types';

function makeResult(similarity: number, overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 1,
    logId: 10,
    chunkIndex: 0,
    content: 'text',
    module: 'Translation',
    severity: 'none',
    issueType: null,
    fromLang: 'auto',
    toLang: 'English',
    logCreatedAt: '2026-01-01T00:00:00Z',
    similarity,
    ...overrides,
  };
}

describe('scoreToLevel', () => {
  it('buckets scores into low/medium/high', () => {
    expect(scoreToLevel(0.1)).toBe('low');
    expect(scoreToLevel(0.4)).toBe('medium');
    expect(scoreToLevel(0.7)).toBe('high');
  });

  it('is inclusive at the boundaries', () => {
    expect(scoreToLevel(0.35)).toBe('medium');
    expect(scoreToLevel(0.55)).toBe('high');
  });
});

describe('averageSimilarity', () => {
  it('averages the similarity of every result', () => {
    expect(averageSimilarity([makeResult(0.2), makeResult(0.4), makeResult(0.6)])).toBeCloseTo(0.4);
  });

  it('returns 0 for no results, never NaN', () => {
    expect(averageSimilarity([])).toBe(0);
  });
});

describe('toSourceRefs', () => {
  it('maps result fields and rounds similarity to 3 decimals', () => {
    const refs = toSourceRefs([makeResult(0.123456, { logId: 99, module: 'Composition' })]);
    expect(refs).toEqual([
      { logId: 99, chunkIndex: 0, timestamp: '2026-01-01T00:00:00Z', module: 'Composition', similarity: 0.123 },
    ]);
  });
});
