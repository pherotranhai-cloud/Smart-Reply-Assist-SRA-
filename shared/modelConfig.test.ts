import { describe, expect, it } from 'vitest';
import { tuningFor } from './modelConfig';

describe('tuningFor rag tasks', () => {
  it('keeps rag-chat bare for the unverified custom model (no unproven temperature param)', () => {
    expect(tuningFor('gpt-5.6-luna', 'rag-chat')).toEqual({});
  });

  it('still lets the custom model use response_format for rag-report (proven safe via security-analyze)', () => {
    expect(tuningFor('gpt-5.6-luna', 'rag-report')).toEqual({ response_format: { type: 'json_object' } });
  });

  it('sends temperature for rag-chat on documented models', () => {
    expect(tuningFor('gpt-4o', 'rag-chat')).toEqual({ temperature: 0.2 });
    expect(tuningFor('gpt-3.5-turbo', 'rag-chat')).toEqual({ temperature: 0.2 });
  });

  it('falls back to the conservative gpt-5.6-luna table for an unlisted model', () => {
    expect(tuningFor('some-future-model', 'rag-chat')).toEqual({});
  });
});
