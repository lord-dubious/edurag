import { describe, expect, it } from 'vitest';
import { generateText } from 'ai';
import { getChatModel } from '../lib/providers';

const runLiveAiTests = process.env.RUN_LIVE_AI_TESTS === '1';

describe.skipIf(!runLiveAiTests)('live chat provider', () => {
  it('generates text through the configured production chat model', async () => {
    const result = await generateText({
      model: getChatModel(),
      prompt: 'Say hello in one short sentence.',
      maxOutputTokens: 128,
      temperature: 0.2,
    });

    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.finishReason).not.toBe('error');
  }, 60000);
});
