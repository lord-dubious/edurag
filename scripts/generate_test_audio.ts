import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function generateTestAudio() {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        console.error('DEEPGRAM_API_KEY is not set');
        process.exit(1);
    }

    const text = "Hello! Could you tell me a little bit about this university?";
    const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=16000', {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        console.error('Failed to generate audio:', response.status, await response.text());
        process.exit(1);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(path.join(process.cwd(), 'test-audio.wav'), Buffer.from(arrayBuffer));
    console.log('Successfully generated test-audio.wav');
}

generateTestAudio().catch(console.error);
