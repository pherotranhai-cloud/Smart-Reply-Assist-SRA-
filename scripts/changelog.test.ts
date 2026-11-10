import { describe, expect, it } from 'vitest';
import { buildPrompt, cleanBody, nextReleaseVersion, parseGitLog, parseVersion } from './changelog';

describe('version helpers', () => {
  it('parses with or without the leading v', () => {
    expect(parseVersion('v2.14.0')).toEqual([2, 14, 0]);
    expect(parseVersion('2.12.25')).toEqual([2, 12, 25]);
    expect(parseVersion('two')).toBeNull();
  });

  it('bumps the minor of whichever is higher: last release or package.json', () => {
    expect(nextReleaseVersion('v2.14.0', '2.12.25')).toBe('v2.15.0');
    expect(nextReleaseVersion('v2.14.0', '2.16.3')).toBe('v2.17.0');
    expect(nextReleaseVersion(undefined, '1.0.4')).toBe('v1.1.0');
  });
});

describe('git log parsing', () => {
  const raw = [
    'aaa\x1fAdd dark mode\x1fLets users pick dark.\n\nCo-Authored-By: X <x@y>\nClaude-Session: https://s\x1e',
    '\nbbb\x1fchore(changelog): update popup [skip ci]\x1f\x1e',
    '\nccc\x1fFix typo\x1f\x1e\n',
  ].join('');

  it('drops the bot commits and attribution trailers', () => {
    expect(parseGitLog(raw)).toEqual([
      { sha: 'aaa', subject: 'Add dark mode', body: 'Lets users pick dark.' },
      { sha: 'ccc', subject: 'Fix typo', body: '' },
    ]);
  });

  it('cleanBody keeps the real description', () => {
    expect(cleanBody('Line one\nSigned-off-by: a\nLine two')).toBe('Line one\nLine two');
  });

  it('caps the prompt length for huge histories', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ sha: String(i), subject: `s${i}`, body: 'x'.repeat(1500) }));
    const prompt = buildPrompt(many);
    expect(prompt.length).toBeLessThan(62_000);
    expect(prompt).toContain('200 commits in total');
  });
});
