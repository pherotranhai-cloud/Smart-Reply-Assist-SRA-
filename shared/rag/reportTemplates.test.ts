import { describe, expect, it } from 'vitest';
import { getReportTemplate, REPORT_TEMPLATES } from './reportTemplates';

describe('REPORT_TEMPLATES', () => {
  it('defines exactly the three required presets', () => {
    expect(Object.keys(REPORT_TEMPLATES).sort()).toEqual(
      ['performance-impact', 'quality-impact', 'standards-issues'].sort()
    );
  });

  it('gives every template at least one retrieval query and a Recommendations section', () => {
    for (const template of Object.values(REPORT_TEMPLATES)) {
      expect(template.semanticQueries.length).toBeGreaterThan(0);
      expect(template.sections.some((s) => s.heading === 'Recommendations')).toBe(true);
    }
  });
});

describe('getReportTemplate', () => {
  it('returns the matching template', () => {
    expect(getReportTemplate('quality-impact').title).toBe('Quality Impact Report');
  });

  it('throws for an unknown id', () => {
    expect(() => getReportTemplate('not-a-template' as any)).toThrow();
  });
});
