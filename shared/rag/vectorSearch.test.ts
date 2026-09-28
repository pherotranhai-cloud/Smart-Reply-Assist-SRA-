import { describe, expect, it } from 'vitest';
import { buildMatchParams, mergeSearchResults } from './vectorSearch';
import { SearchResult } from './types';

describe('buildMatchParams', () => {
  it('coalesces missing/blank filters to null so the RPC does not filter on them', () => {
    const params = buildMatchParams([0.1, 0.2], 5, {});
    expect(params).toEqual({
      query_embedding: [0.1, 0.2],
      match_count: 5,
      filter_module: null,
      filter_severity: null,
      filter_issue_type: null,
      filter_from: null,
      filter_to: null,
    });
  });

  it('passes through provided filters', () => {
    const params = buildMatchParams([0.1], 8, {
      module: 'Translation',
      severity: 'high',
      issueType: 'empty_response',
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
    expect(params.filter_module).toBe('Translation');
    expect(params.filter_severity).toBe('high');
    expect(params.filter_issue_type).toBe('empty_response');
    expect(params.filter_from).toBe('2026-01-01T00:00:00Z');
    expect(params.filter_to).toBe('2026-02-01T00:00:00Z');
  });
});

function makeResult(id: number, similarity: number): SearchResult {
  return {
    id,
    logId: id,
    chunkIndex: 0,
    content: `content-${id}`,
    module: 'Translation',
    severity: 'none',
    issueType: null,
    fromLang: 'auto',
    toLang: 'English',
    logCreatedAt: null,
    similarity,
  };
}

describe('mergeSearchResults', () => {
  it('deduplicates by id, keeping the highest similarity seen', () => {
    const merged = mergeSearchResults([
      [makeResult(1, 0.3), makeResult(2, 0.5)],
      [makeResult(1, 0.8), makeResult(3, 0.4)],
    ]);
    expect(merged.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(merged.find((r) => r.id === 1)?.similarity).toBe(0.8);
  });

  it('sorts the merged results by similarity descending', () => {
    const merged = mergeSearchResults([[makeResult(1, 0.1), makeResult(2, 0.9), makeResult(3, 0.5)]]);
    expect(merged.map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
