import { describe, expect, it } from 'vitest';
import { buildComposeSystemPrompt, buildComposeUserMessage } from './compose';
import { CORE_PRESETS } from '../src/constants';

describe('buildComposeSystemPrompt', () => {
  const goalOf = (id: string) => (id === 'custom' ? 'Custom' : id.charAt(0).toUpperCase() + id.slice(1));

  it.each(CORE_PRESETS.map((p) => [p.id, p]))('describes every setting of the %s preset', (_id, preset) => {
    const p = buildComposeSystemPrompt({ lang: 'Vietnamese', goal: goalOf(preset.id), ...preset.settings });
    expect(p).toContain(`Purpose (${goalOf(preset.id)}):`);
    // Raw enum values must not leak in place of their descriptions.
    expect(p).not.toMatch(/Audience: \w+_\w+|Tone: \w+_\w+|Format: \w+_\w+/);
    expect(p).toContain('Write the whole text in Vietnamese');
  });

  it('falls back to Custom and defaults for unknown values', () => {
    const p = buildComposeSystemPrompt({ lang: 'English', goal: 'Whatever', audience: 'x', tone: 'y', length: 'z', format: 'w' });
    expect(p).toContain('Purpose (Custom):');
    expect(p).toContain('Audience: Colleagues in other departments');
    expect(p).toContain('Tone: Professional');
    expect(p).toContain('Length: Standard');
    expect(p).toContain('Format: Group chat message');
  });

  it('asks for an English "Subject:" line in emails only, which the client splits off', () => {
    expect(buildComposeSystemPrompt({ lang: 'Chinese (Traditional)', format: 'formal_email' })).toContain('keep the word "Subject:" itself in English');
    expect(buildComposeSystemPrompt({ lang: 'English', format: 'wechat_zalo' })).toContain('No subject line');
  });

  it('forbids invented facts and allows bracketed placeholders', () => {
    const p = buildComposeSystemPrompt({ lang: 'Vietnamese' });
    expect(p).toContain('Do not invent facts');
    expect(p).toContain('[ngày]');
    expect(p).toContain('only for a detail the text cannot be sent without');
  });

  it('uses language-specific forms of address and script rules', () => {
    expect(buildComposeSystemPrompt({ lang: 'Vietnamese' })).toContain('Ban Giám đốc');
    const zh = buildComposeSystemPrompt({ lang: 'Chinese (Simplified)' });
    expect(zh).toContain('您');
    expect(zh).toContain('Simplified characters');
  });

  it('adds the glossary only when there is one', () => {
    expect(buildComposeSystemPrompt({ lang: 'English' }, '[]')).not.toContain('<glossary>');
    expect(buildComposeSystemPrompt({ lang: 'English' }, '[{"term":"keo","translation":"cement"}]')).toContain('<glossary>');
  });
});

describe('buildComposeUserMessage', () => {
  it('wraps the notes, and the incoming message when there is one', () => {
    expect(buildComposeUserMessage('', 'xin nghỉ phép')).toBe('<my_notes>\nxin nghỉ phép\n</my_notes>');
    expect(buildComposeUserMessage('Khi nào giao hàng?', 'thứ 6')).toBe(
      '<incoming_message>\nKhi nào giao hàng?\n</incoming_message>\n\n<my_notes>\nthứ 6\n</my_notes>',
    );
  });

  it('asks for a reply when only an incoming message is given', () => {
    expect(buildComposeUserMessage('Khi nào giao hàng?', '  ')).toContain('write my reply to the incoming message');
  });
});
