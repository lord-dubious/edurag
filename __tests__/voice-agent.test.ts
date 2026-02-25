import { describe, it, expect } from 'vitest';
import { stripMarkdownForVoice, getSystemPrompt } from '../lib/voice/useDeepgramVoice';

describe('Voice Agent Utilities', () => {
    describe('stripMarkdownForVoice', () => {
        it('should strip markdown headers and bold syntax', () => {
            const input = '# Hello **world**';
            const output = stripMarkdownForVoice(input);
            expect(output).toBe('Hello world');
        });

        it('should strip links but keep text', () => {
            const input = 'Check out [this link](https://example.com) for more info.';
            const output = stripMarkdownForVoice(input);
            expect(output).toBe('Check out this link for more info.');
        });

        it('should remove complex markdown patterns and extra whitespace', () => {
            const input = `
        # Requirements
        - Minimum GPA: **3.0**
        - [Apply here](https://apply.edu)
      `;
            // 'Requirements Minimum GPA: 3.0 Apply here'
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('Requirements');
            expect(output).toContain('Minimum GPA: 3.0');
            expect(output).toContain('Apply here');
            expect(output).not.toContain('*');
            expect(output).not.toContain('#');
            expect(output).not.toContain('[');
        });

        it('should handle JSON-like quotes and brackets properly', () => {
            const input = '{"title": "Program", "content": "The *best* program"}';
            const output = stripMarkdownForVoice(input);
            expect(output).not.toContain('{');
            expect(output).not.toContain('}');
            expect(output).not.toContain('*');
        });
    });

    describe('getSystemPrompt', () => {
        it('should include the default institution name', () => {
            const prompt = getSystemPrompt();
            expect(prompt).toContain('advisor at the university');
        });

        it('should inject custom institution name', () => {
            const prompt = getSystemPrompt('Global Tech University');
            expect(prompt).toContain('advisor at Global Tech University');
        });

        it('should contain the specific negative constraints to avoid robotic speech', () => {
            const prompt = getSystemPrompt();
            expect(prompt).toContain('Never mention searching');
            expect(prompt).toContain('based on my search');
            expect(prompt).toContain('Never use Markdown');
        });
    });
});
