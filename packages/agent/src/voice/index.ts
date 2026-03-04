import type { VoiceMessage } from './types';

import { marked, Renderer } from 'marked';

export function stripMarkdownForVoice(text: string): string {
    const renderer = new Renderer();

    renderer.heading = (token: any) => `${token.text}. `;
    renderer.paragraph = (token: any) => `${token.text} `;
    renderer.strong = (token: any) => token.text;
    renderer.em = (token: any) => token.text;
    renderer.codespan = (token: any) => token.text;
    renderer.code = () => ' ';  // Drop code blocks entirely
    renderer.link = (token: any) => token.text; // Keep link text, drop URL
    renderer.image = () => ''; // Drop images
    renderer.list = (token: any) => token.body || '';
    renderer.listitem = (token: any) => `${token.text}. `;
    renderer.blockquote = (token: any) => token.text;
    renderer.hr = () => '. ';
    renderer.br = () => ' ';
    renderer.table = (token: any) => `${token.header} ${token.rows}`;
    renderer.tablerow = (token: any) => `${token.content} `;
    renderer.tablecell = (token: any) => `${token.text}. `;
    renderer.del = (token: any) => token.text;

    try {
        const html = marked(text, { renderer, async: false }) as string;
        return html
            .replace(/<[^>]+>/g, ' ')  // Strip any residual HTML tags
            .replace(/https?:\/\/\S+/g, '')  // Remove bare URLs
            .replace(/\s{2,}/g, ' ')
            .trim();
    } catch {
        // Fallback to simple strip on parse failure
        return text.replace(/[#*`_~\[\]()>|]/g, '').replace(/\s{2,}/g, ' ').trim();
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
