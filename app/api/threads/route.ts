import { z } from 'zod';
import { clearHistory } from '@/lib/conversation';
import { errorResponse } from '@/lib/errors';

const bodySchema = z.object({
  threadId: z.string().min(1),
});

export async function DELETE(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, err);
  }

  await clearHistory(body.threadId);

  return Response.json({ success: true });
}
