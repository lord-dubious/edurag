import { describe, expect, it } from 'vitest';
import { getSourceHostname } from '@/lib/chat/sources';

describe('chat source helpers', () => {
  it('strips only a leading www prefix from source hostnames', () => {
    expect(getSourceHostname('https://www.example.edu/path')).toBe('example.edu');
    expect(getSourceHostname('https://api.www.example.edu/path')).toBe('api.www.example.edu');
  });
});
