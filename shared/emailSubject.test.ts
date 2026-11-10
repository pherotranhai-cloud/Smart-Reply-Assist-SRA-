import { describe, expect, it } from 'vitest';
import { splitEmailSubject } from './emailSubject';

describe('splitEmailSubject', () => {
  it.each([
    ['Subject: Delay of RY2611-045\n\nDear team,\nBody', 'Delay of RY2611-045'],
    ['**Subject:** Delay of RY2611-045\n\nDear team,\nBody', 'Delay of RY2611-045'],
    ['**Subject**: Delay of RY2611-045\nDear team,\nBody', 'Delay of RY2611-045'],
    ['**Chủ đề:** Báo cáo sự cố\n\nKính gửi anh,\nBody', 'Báo cáo sự cố'],
    ['主旨：交期延誤說明\n\n您好：\nBody', '交期延誤說明'],
    ['\n  Subject: Leading blank line\nBody', 'Leading blank line'],
  ])('finds the subject in %j', (text, subject) => {
    const out = splitEmailSubject(text);
    expect(out.subject).toBe(subject);
    expect(out.body.startsWith('Subject')).toBe(false);
    expect(out.body).toContain('Body');
  });

  it('leaves a text without a subject line untouched', () => {
    const text = 'Dear team,\nThe subject: of today is quality.';
    expect(splitEmailSubject(text)).toEqual({ subject: '', body: text });
  });

  it('ignores an empty subject', () => {
    expect(splitEmailSubject('Subject:\nBody')).toEqual({ subject: '', body: 'Subject:\nBody' });
  });
});
