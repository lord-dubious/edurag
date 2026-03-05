import { generateText } from 'ai';
import { getChatProvider, getChatModel } from './providers';
import { updateConversationTitle } from './conversation';
import { env } from './env';

export async function generateAndSaveTitle(threadId: string, userMessage: string, userId?: string): Promise<void> {
    try {
        // Quick bypass for Voice Handoff messages to instantly get the perfect title via regex
        const handoffMatch = userMessage.match(/^\[VOICE_HANDOFF\] I am providing the detailed Markdown notes and source links for (.*?) now as requested in our conversation\./i);
        if (handoffMatch && handoffMatch[1]) {
            await updateConversationTitle(threadId, handoffMatch[1].trim(), userId);
            return;
        }

        const titleModel = env.TITLE_MODEL
            ? getChatProvider().chat(env.TITLE_MODEL)
            : getChatModel();

        const { text } = await generateText({
            model: titleModel,
            system: `You are an expert title generator. Create a concise, 3-5 word title for the following user message. 
If it is a voice handoff message, ignore the system wrapper and focus only on the topic the user asked about.
Do not include quotation marks, boilerplate, or trailing punctuation. Just the title text.`,
            prompt: userMessage,
        });

        if (text) {
            let cleanTitle = text.trim().replace(/^["']|["']$/g, '');
            // Collapse whitespace
            cleanTitle = cleanTitle.replace(/\s+/g, ' ');
            // Truncate to Max Length
            if (cleanTitle.length > 100) {
                cleanTitle = cleanTitle.substring(0, 97) + '...';
            }
            await updateConversationTitle(threadId, cleanTitle, userId);
        }
    } catch (err) {
        console.error('[TitleGenerator] Failed to generate and save title:', err);
    }
}
