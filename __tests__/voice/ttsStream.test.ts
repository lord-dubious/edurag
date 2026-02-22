import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn(() => ({
    speak: {
      live: vi.fn(() => ({
        on: vi.fn(),
        sendText: vi.fn(),
        flush: vi.fn(),
        requestClose: vi.fn(),
      })),
    },
  })),
  LiveTTSEvents: {
    Open: 'open',
    Audio: 'audio',
    Error: 'error',
    Close: 'close',
  },
}));

describe('cleanForSpeech', () => {
  it('removes bold markdown', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('**bold text** here');
    expect(result).toBe('bold text here');
  });

  it('removes italic markdown', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('*italic* text');
    expect(result).toBe('italic text');
  });

  it('removes links but keeps text', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('click [here](https://example.com)');
    expect(result).toBe('click here');
  });

  it('removes citations', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('See 【1†L10-L20】 for details');
    expect(result).toBe('See for details');
  });

  it('removes markdown headings', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('## Heading\nContent');
    expect(result).toContain('Heading');
    expect(result).not.toContain('##');
  });

  it('removes code blocks entirely', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('Here is ```code``` example');
    expect(result).toBe('Here is example');
  });

  it('removes inline code backticks', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('Use the `npm install` command');
    expect(result).toBe('Use the npm install command');
  });

  it('removes multi-line code blocks', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('Before\n```\ncode here\n```\nAfter');
    expect(result).toBe('Before After');
  });

  it('normalizes whitespace', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('multiple   spaces\n\nand newlines');
    expect(result).toBe('multiple spaces and newlines');
  });

  it('trims leading and trailing whitespace', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('  hello world  ');
    expect(result).toBe('hello world');
  });

  it('handles empty string', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('');
    expect(result).toBe('');
  });

  it('handles text with no markdown', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('plain text without formatting');
    expect(result).toBe('plain text without formatting');
  });

  it('removes heading with different levels', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    expect(cleanForSpeech('# H1')).toBe('H1');
    expect(cleanForSpeech('### H3')).toBe('H3');
    expect(cleanForSpeech('###### H6')).toBe('H6');
  });

  it('handles complex markdown combinations', async () => {
    const { cleanForSpeech } = await import('@/lib/voice/ttsStream');
    const result = cleanForSpeech('**bold** and *italic* with [link](url) and `code`');
    expect(result).toBe('bold and italic with link and code');
  });
});

describe('chunkSentences', () => {
  it('yields complete sentences', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'Hello. ' };
      yield { type: 'agent_chunk' as const, text: 'How are you?' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toContain('Hello.');
    expect(sentences).toContain('How are you?');
  });

  it('buffers incomplete sentences until done', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'This is incomplete' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain('This is incomplete');
  });

  it('splits on exclamation marks', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'Wow! Amazing!' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toContain('Wow!');
    expect(sentences).toContain('Amazing!');
  });

  it('splits on question marks', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'What? Why?' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toContain('What?');
    expect(sentences).toContain('Why?');
  });

  it('handles empty chunks', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: '' };
      yield { type: 'agent_chunk' as const, text: 'Hello.' };
      yield { type: 'agent_chunk' as const, text: '' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toEqual(['Hello.']);
  });

  it('handles only whitespace in buffer', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: '   ' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toHaveLength(0);
  });

  it('flushes buffer when exceeding max buffer size', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    const longText = 'a'.repeat(150);
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: longText };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain('a');
  });

  it('cleans markdown from sentences', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: '**Bold** text. *Italic* here.' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences[0]).toBe('Bold text.');
    expect(sentences[1]).toBe('Italic here.');
  });

  it('handles multiple chunks forming one sentence', async () => {
    const { chunkSentences } = await import('@/lib/voice/ttsStream');
    
    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'This ' };
      yield { type: 'agent_chunk' as const, text: 'is ' };
      yield { type: 'agent_chunk' as const, text: 'one sentence.' };
      yield { type: 'agent_done' as const };
    }

    const sentences: string[] = [];
    for await (const sentence of chunkSentences(source())) {
      sentences.push(sentence);
    }

    expect(sentences).toEqual(['This is one sentence.']);
  });
});

describe('streamTTS', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends error when no provider configured', async () => {
    vi.doMock('@/lib/voice/ttsProvider', () => ({
      getTTSConfig: () => null,
    }));

    const { streamTTS } = await import('@/lib/voice/ttsStream');
    
    const ws = {
      readyState: 1,
      send: vi.fn(),
    };

    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'Hello' };
      yield { type: 'agent_done' as const };
    }

    await streamTTS(source(), new AbortController().signal, ws as any);

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('error')
    );
  });

  it('stops when signal is aborted', async () => {
    vi.doMock('@/lib/voice/ttsProvider', () => ({
      getTTSConfig: () => ({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'tts-1',
      }),
    }));

    const { streamTTS } = await import('@/lib/voice/ttsStream');
    
    const ws = {
      readyState: 1,
      send: vi.fn(),
    };

    const controller = new AbortController();
    controller.abort();

    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'Hello.' };
      yield { type: 'agent_done' as const };
    }

    await streamTTS(source(), controller.signal, ws as any);

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('handles WebSocket not ready - no audio sent', async () => {
    vi.doMock('@/lib/voice/ttsProvider', () => ({
      getTTSConfig: () => null,
    }));

    const { streamTTS } = await import('@/lib/voice/ttsStream');
    
    const ws = {
      readyState: 0,
      send: vi.fn(),
    };

    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'Hello.' };
      yield { type: 'agent_done' as const };
    }

    await streamTTS(source(), new AbortController().signal, ws as any);

    expect(ws.send).not.toHaveBeenCalledWith(
      expect.stringContaining('agent_audio')
    );
  });

  it('handles Deepgram provider configuration', async () => {
    const mockConnection = {
      on: vi.fn(),
      sendText: vi.fn(),
      flush: vi.fn(),
      requestClose: vi.fn(),
    };

    vi.doMock('@deepgram/sdk', () => ({
      createClient: vi.fn(() => ({
        speak: {
          live: vi.fn(() => mockConnection),
        },
      })),
      LiveTTSEvents: {
        Open: 'open',
        Audio: 'audio',
        Error: 'error',
        Close: 'close',
      },
    }));

    vi.doMock('@/lib/voice/ttsProvider', () => ({
      getTTSConfig: () => ({
        provider: 'deepgram',
        apiKey: 'test-deepgram-key',
        model: 'aura-2-andromeda-en',
      }),
    }));

    const { streamTTS } = await import('@/lib/voice/ttsStream');
    
    const ws = {
      readyState: 1,
      send: vi.fn(),
    };

    async function* source() {
      yield { type: 'agent_chunk' as const, text: 'Hello.' };
      yield { type: 'agent_done' as const };
    }

    const controller = new AbortController();
    
    setTimeout(() => controller.abort(), 100);

    await streamTTS(source(), controller.signal, ws as any);

    expect(mockConnection.requestClose).toHaveBeenCalled();
  });
});

describe('createChunkIterator', () => {
  it('iterates over chunks', async () => {
    const { createChunkIterator } = await import('@/lib/voice/ttsStream');
    
    const chunks = [
      { type: 'agent_chunk' as const, text: 'Hello' },
      { type: 'agent_chunk' as const, text: ' world' },
    ];
    
    const doneFlag = { value: false };
    const signal = new AbortController().signal;
    
    const results: any[] = [];
    
    setTimeout(() => {
      doneFlag.value = true;
    }, 50);
    
    for await (const chunk of createChunkIterator(chunks, signal, doneFlag)) {
      results.push(chunk);
      if (results.length >= 3) break;
    }
    
    expect(results[0]).toEqual({ type: 'agent_chunk', text: 'Hello' });
    expect(results[1]).toEqual({ type: 'agent_chunk', text: ' world' });
  });

  it('stops on abort signal', async () => {
    const { createChunkIterator } = await import('@/lib/voice/ttsStream');
    
    const chunks = [
      { type: 'agent_chunk' as const, text: 'Hello' },
    ];
    
    const doneFlag = { value: false };
    const controller = new AbortController();
    controller.abort();
    
    const results: any[] = [];
    
    for await (const chunk of createChunkIterator(chunks, controller.signal, doneFlag)) {
      results.push(chunk);
    }
    
    expect(results).toHaveLength(0);
  });
});
