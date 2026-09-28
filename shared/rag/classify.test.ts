import { describe, expect, it } from 'vitest';
import { classifyLog, moduleForTaskType } from './classify';
import { LogRow } from './types';

function makeLog(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: 1,
    created_at: '2026-01-01T00:00:00Z',
    task_type: 'translate',
    input_text: 'Please tighten the bolts on line 3 before the next shift.',
    output_text: 'Vui lòng siết chặt bu lông trên line 3 trước ca tiếp theo.',
    from_lang: 'auto',
    to_lang: 'Vietnamese',
    ...overrides,
  };
}

describe('moduleForTaskType', () => {
  it('maps known task types to a display module', () => {
    expect(moduleForTaskType('translate')).toBe('Translation');
    expect(moduleForTaskType('ocr_translate')).toBe('OCR Translation');
    expect(moduleForTaskType('compose')).toBe('Composition');
  });

  it('title-cases an unknown task type instead of dropping it', () => {
    expect(moduleForTaskType('future_feature')).toBe('Future Feature');
  });

  it('falls back to Unclassified for null/empty', () => {
    expect(moduleForTaskType(null)).toBe('Unclassified');
    expect(moduleForTaskType('  ')).toBe('Unclassified');
  });
});

describe('classifyLog', () => {
  it('flags an empty response as high severity', () => {
    const result = classifyLog(makeLog({ output_text: '' }));
    expect(result.severity).toBe('high');
    expect(result.issueType).toBe('empty_response');
  });

  it('flags a response much shorter than its input as truncated', () => {
    const result = classifyLog(
      makeLog({
        input_text: 'A'.repeat(200),
        output_text: 'short',
      })
    );
    expect(result.severity).toBe('medium');
    expect(result.issueType).toBe('truncated_or_short_response');
  });

  it('flags an error keyword in the output', () => {
    const result = classifyLog(makeLog({ output_text: 'Error: could not translate this segment.' }));
    expect(result.severity).toBe('medium');
    expect(result.issueType).toBe('error_keyword_detected');
  });

  it('flags a Vietnamese error keyword too', () => {
    const result = classifyLog(makeLog({ output_text: 'Đã xảy ra lỗi khi dịch đoạn này.' }));
    expect(result.issueType).toBe('error_keyword_detected');
  });

  it('classifies a normal successful log as no issue', () => {
    const result = classifyLog(makeLog());
    expect(result.severity).toBe('none');
    expect(result.issueType).toBeNull();
    expect(result.module).toBe('Translation');
  });
});
