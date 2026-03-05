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

        it('should handle a realistic AI response with citations', () => {
            const input = `The MBA program at **State University** has several key requirements:

1. A minimum GPA of **3.0** from your undergraduate program
2. Valid [GMAT](https://www.mba.com/gmat) or GRE scores
3. Two letters of recommendation

For more details, visit the [admissions page](https://university.edu/mba/admissions).

【1†L1-L30】`;
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('MBA program');
            expect(output).toContain('State University');
            expect(output).toContain('minimum GPA of 3.0');
            expect(output).toContain('GMAT');
            expect(output).toContain('letters of recommendation');
            expect(output).not.toContain('**');
            expect(output).not.toContain('https://');
            expect(output).not.toContain('[');
            expect(output).not.toContain(']');
            expect(output).not.toContain('【');
            expect(output).not.toContain('】');
            expect(output).not.toContain('†');
        });

        it('should handle markdown tables for voice output', () => {
            const input = `| Program | Duration | Tuition |
|---------|----------|---------|
| MBA | 2 years | $45,000 |
| MS CS | 1.5 years | $38,000 |`;
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('Program');
            expect(output).toContain('MBA');
            expect(output).toContain('2 years');
            expect(output).toContain('MS CS');
            expect(output).not.toContain('|');
            expect(output).not.toContain('---');
        });

        it('should handle code blocks by extracting text content', () => {
            const input = `Here's the command to apply:

\`\`\`
apply --program mba --term fall2025
\`\`\`

You can also use \`online-portal\` to submit.`;
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('command to apply');
            expect(output).toContain('apply --program mba --term fall2025');
            expect(output).toContain('online-portal');
            expect(output).not.toContain('```');
            expect(output).not.toContain('`');
        });

        it('should handle blockquotes', () => {
            const input = `> "Education is the most powerful weapon" - Nelson Mandela

This quote inspires our mission.`;
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('Education is the most powerful weapon');
            expect(output).toContain('inspires our mission');
            expect(output).not.toContain('>');
        });

        it('should handle nested formatting like bold within italics', () => {
            const input = 'The ***most important*** deadline is _**January 15th**_.';
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('most important');
            expect(output).toContain('deadline');
            expect(output).toContain('January 15th');
            expect(output).not.toContain('*');
            expect(output).not.toContain('_');
        });

        it('should strip horizontal rules', () => {
            const input = `Section one content.

---

Section two content.`;
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('Section one content');
            expect(output).toContain('Section two content');
            expect(output).not.toContain('---');
        });

        it('should handle strikethrough text', () => {
            const input = 'The deadline was ~~March 1st~~ extended to March 15th.';
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('March 1st');
            expect(output).toContain('March 15th');
            expect(output).not.toContain('~~');
        });

        it('should handle empty and whitespace-only input', () => {
            expect(stripMarkdownForVoice('')).toBe('');
            expect(stripMarkdownForVoice('   ')).toBe('');
            expect(stripMarkdownForVoice('\n\n\n')).toBe('');
        });

        it('should handle a full realistic agent response', () => {
            const input = `## Financial Aid at State University

Great question! There are **several options** available:

### Scholarships
- **Merit-based**: Awarded based on GPA and test scores
- **Need-based**: Determined by [FAFSA](https://fafsa.ed.gov) results
- **Athletic**: For student-athletes in NCAA Division I sports

### Deadlines
| Type | Fall | Spring |
|------|------|--------|
| Merit | March 1 | October 15 |
| Need | April 15 | November 30 |

> Note: Early applications receive priority consideration.

For the full breakdown, visit [Financial Aid Office](https://university.edu/finaid) or call **(555) 123-4567**.`;
            const output = stripMarkdownForVoice(input);
            expect(output).toContain('Financial Aid');
            expect(output).toContain('several options');
            expect(output).toContain('Merit-based');
            expect(output).toContain('FAFSA');
            expect(output).toContain('NCAA Division I');
            expect(output).toContain('March 1');
            expect(output).toContain('Early applications receive priority');
            expect(output).toContain('(555) 123-4567');
            expect(output).not.toContain('**');
            expect(output).not.toContain('##');
            expect(output).not.toContain('|');
            expect(output).not.toContain('https://');
            expect(output).not.toContain('[');
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
            expect(prompt).toContain('ABSOLUTELY NO MARKDOWN');
        });

        it('should contain search behavior guidelines', () => {
            const prompt = getSystemPrompt();
            expect(prompt).toContain('Search ONLY when');
            expect(prompt).toContain('Do NOT search for greetings');
            expect(prompt).toContain('Do NOT search again');
        });

        it('should contain speech rules for TTS compatibility', () => {
            const prompt = getSystemPrompt();
            expect(prompt).toContain('Plain English only');
            expect(prompt).toContain('Never read URLs');
        });

        it('should use the institution name multiple times for context', () => {
            const prompt = getSystemPrompt('MIT');
            const matches = prompt.match(/MIT/g);
            expect(matches).not.toBeNull();
            expect(matches!.length).toBeGreaterThanOrEqual(2);
        });
    });
});
