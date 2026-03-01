import { generateText } from 'ai';
import { env } from './env';
import { updateConversationTitle } from './conversation';
import { createOpenAI } from '@ai-sdk/openai';

const titleModel = createOpenAI({
    apiKey: env.CHAT_API_KEY,
    baseURL: env.CHAT_BASE_URL,
})('llama3.1-8b');

export async function generateAndSaveTitle(threadId: string, userMessage: string, userId?: string) {
    try {
        // Quick bypass for Voice Handoff messages to instantly get the perfect title via regex
        const handoffMatch = userMessage.match(/^\[VOICE_HANDOFF\] The user asked about "(.*?)" via voice/i);
        if (handoffMatch && handoffMatch[1]) {
            await updateConversationTitle(threadId, handoffMatch[1].trim(), userId);
            return;
        }

        const { text } = await generateText({
            model: titleModel,
            system: `You are an expert title generator. Create a concise, 3-5 word title for the following user message. 
If it is a voice handoff message, ignore the system wrapper and focus only on the topic the user asked about.
Do not include quotation marks, boilerplate, or trailing punctuation. Just the title text.`,
            prompt: userMessage,
        });

        if (text) {
            const cleanTitle = text.trim().replace(/^["']|["']$/g, '');
            await updateConversationTitle(threadId, cleanTitle, userId);
        }
    } catch (err) {
        console.error('[TitleGenerator] Failed to generate and save title:', err);
    }
}
