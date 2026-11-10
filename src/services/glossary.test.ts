import { describe, expect, it } from 'vitest';
import type { VocabItem } from '../types';
import { matchGlossary } from './glossary';

function row(id: string, vi: string, zh_cn: string, en = ''): VocabItem {
  return { id, term: 'Test', vi, en, zh_cn, zh_tw: '', id_lang: '', my: '' };
}

const VOCAB: VocabItem[] = [
  row('may', 'may', '縫製', 'sewing'),
  row('chuyen', 'chuyền', '產線', 'line'),
  row('ca', 'cà', '滾壓', 'rolling'),
  row('dao', 'đạo', '道'),
  row('cong-nhan', 'công nhân', '工人', 'worker'),
];

function sources(text: string): string[] {
  return matchGlossary(text, VOCAB, 'Chinese (Simplified)').map(m => m.source);
}

describe('matchGlossary diacritics', () => {
  it('does not match "may" when the text says "máy"', () => {
    expect(sources('các máy còn lại')).not.toContain('may');
    expect(sources('máy')).toEqual([]);
  });

  it('matches "may" when the text says "may"', () => {
    const matches = matchGlossary('bộ phận may', VOCAB, 'Chinese (Simplified)');
    expect(matches.map(m => m.source)).toEqual(['may']);
    expect(matches[0].target).toBe('縫製');
  });

  it('matches unaccented "chuyen" against "chuyền"', () => {
    const matches = matchGlossary('chuyen 5 thieu cong nhan', VOCAB, 'Chinese (Simplified)');
    expect(matches.map(m => m.source)).toEqual(['chuyền', 'công nhân']);
    expect(matches.map(m => 'chuyen 5 thieu cong nhan'.slice(m.start, m.end))).toEqual(['chuyen', 'cong nhan']);
  });

  it('matches accented "chuyền" against "chuyền"', () => {
    expect(sources('chuyền 5 thiếu công nhân')).toEqual(['chuyền', 'công nhân']);
  });

  it('is case-insensitive when diacritics agree', () => {
    expect(sources('CHUYỀN 5')).toEqual(['chuyền']);
  });

  it('rejects a segment whose diacritics differ from the library phrase', () => {
    expect(sources('chuyến hàng')).toEqual([]); // sắc, not huyền
    expect(sources('cá')).toEqual([]);
    expect(sources('cà')).toEqual(['cà']);
  });

  it('compares in NFC, so decomposed input still matches', () => {
    const decomposed = 'chuyền'.normalize('NFD');
    const matches = matchGlossary(`${decomposed} 5`, VOCAB, 'Chinese (Simplified)');
    expect(matches.map(m => m.source)).toEqual(['chuyền']);
    expect(`${decomposed} 5`.slice(matches[0].start, matches[0].end)).toBe(decomposed);
    expect(sources('máy')).toEqual([]); // decomposed "máy"
  });

  it('treats đ as a diacritic: "dao" matches "đạo", "dạo" does not', () => {
    expect(sources('dao')).toEqual(['đạo']);
    expect(sources('Đạo')).toEqual(['đạo']);
    expect(sources('dạo')).toEqual([]);
  });
});
