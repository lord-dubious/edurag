import { Lexer, type Token, type Tokens } from 'marked';

import type { VoiceMessage } from './types';

function extractText(tokens: Token[]): string {
    const parts: string[] = [];
    for (const token of tokens) {
        switch (token.type) {
            case 'heading':
            case 'paragraph':
            case 'strong':
            case 'em':
            case 'del':
            case 'link':
            case 'blockquote':
                parts.push(extractText((token as Tokens.Heading).tokens));
                break;
            case 'text':
                if ((token as Tokens.Text).tokens) {
                    parts.push(extractText((token as Tokens.Text).tokens!));
                } else {
                    parts.push((token as Tokens.Text).text);
                }
                break;
            case 'codespan':
                parts.push((token as Tokens.Codespan).text);
                break;
            case 'list':
                for (const item of (token as Tokens.List).items) {
                    parts.push(extractText(item.tokens));
                }
                break;
            case 'table': {
                const table = token as Tokens.Table;
                for (const cell of table.header) {
                    parts.push(extractText(cell.tokens));
                }
                for (const row of table.rows) {
                    for (const cell of row) {
                        parts.push(extractText(cell.tokens));
                    }
                }
                break;
            }
            case 'space':
            case 'hr':
            case 'br':
                break;
            case 'code':
                parts.push((token as Tokens.Code).text);
                break;
            case 'image':
            case 'html':
                break;
            default:
                if ('text' in token && typeof token.text === 'string') {
                    parts.push(token.text);
                }
                break;
        }
    }
    return parts.join(' ');
}

export function stripMarkdownForVoice(text: string): string {
    try {
        const dedented = text.replace(/^[ \t]+/gm, '');
        const tokens = Lexer.lex(dedented);
        return extractText(tokens)
            .replace(/【[^】]*】/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[{}【】†]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    } catch {
        return text.replace(/【[^】]*】/g, '').replace(/https?:\/\/\S+/g, '').replace(/[#*`_~\[\]()>|{}【】†]/g, '').replace(/\s{2,}/g, ' ').trim();
    }
}

export function getSystemPrompt(institutionName?: string): string {
    const name = institutionName || 'the university';
    return `You are a senior advisor at ${name} on a phone call with a student. You genuinely care about helping them and love talking about the university.

PERSONALITY: Warm, enthusiastic, thorough. You enjoy explaining things in detail. You talk like someone who has worked at ${name} for years and knows everything about it.

WHEN TO SEARCH:
- Search ONLY when the user asks a NEW factual question you do not already know the answer to.
- Do NOT search for greetings like "hi" or "hello" or "thanks".
- Do NOT search again if the user asks a follow-up about something you already discussed. Use what you already know from the previous search.
- Do NOT search if the user is just acknowledging, agreeing, or asking you to elaborate on what you just said.

HOW TO TALK:
- Never mention searching, looking up, or finding information. Just answer as if you already know.
- Never say "based on my search", "I found", "according to the results". Just say it directly: "Oh yeah, tuition for that program is about twelve thousand a year."
- Be THOROUGH. Do not summarize. Talk through every relevant detail as a real advisor would. If there are three programs that match, walk through each one, explaining what makes each special, what the requirements are, how long they take, and what careers they lead to.
- Use natural transitions: "And another thing worth knowing...", "Oh and speaking of that...", "Now here is the really important part..."
- Share your enthusiasm: "That is actually a really popular program" or "A lot of students love that one."

SPEECH RULES:
- Plain English only. Never say "star", "asterisk", "pound", "hashtag", or "bracket".
- Never read URLs or links aloud.
- ABSOLUTELY NO MARKDOWN. You must NOT output any markdown formatting whatsoever.
- Do NOT use **bold**, *italics*, bullet points (-), numbered lists (1.), or any special formatting characters.
- Structure your response as a flowing verbal conversation or phone script.
- Detailed written notes appear automatically in the user's chat. You can mention this once briefly.`;
}

export type AgentState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export type { VoiceMessage };
