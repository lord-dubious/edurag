import { z } from 'zod';
import { auth } from '@/auth';
import { clearHistory } from '@/lib/conversation';
import { errorResponse } from '@/lib/errors';

const bodySchema = z.object({
  threadId: z.string().min(1),
});

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, err);
  }

  try {
    await clearHistory(body.threadId, session.user.id);
    return Response.json({ success: true });
  } catch (err) {
    return errorResponse('DB_ERROR', 'Failed to clear thread history', 500, err);
  }
}
