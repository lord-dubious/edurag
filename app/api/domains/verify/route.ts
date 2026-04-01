import { z } from 'zod';
import { NextRequest } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/errors';
import { verifyIndexedSources } from '@/lib/source-verification';

const bodySchema = z.object({
  threadId: z.string().min(1).optional(),
  maxUrls: z.coerce.number().min(1).max(500).optional(),
  maxDocsToScan: z.coerce.number().min(1).max(50000).optional(),
  timeoutMs: z.coerce.number().min(1000).max(30000).optional(),
  concurrency: z.coerce.number().min(1).max(20).optional(),
});

/**
 * Handle POST requests to verify indexed domain sources and return the verification outcome.
 *
 * Validates that the requester is an admin, parses and validates the request JSON against the expected body schema,
 * invokes the verification process, and returns the verification results or a standardized error response.
 *
 * @param req - The incoming Next.js request whose JSON body may include verification options (e.g., threadId, maxUrls, maxDocsToScan, timeoutMs, concurrency).
 * @returns A Response:
 *  - On success: a JSON payload containing `success: true` and verification details.
 *  - On failure: a standardized error response with an appropriate HTTP status code (401 for unauthorized, 400 for validation errors, 500 for internal verification errors).
 */
export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const rawBody = await req.json();
    body = bodySchema.parse(rawBody);
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid input', 400, err);
  }

  try {
    const verification = await verifyIndexedSources(body);
    return Response.json({
      success: true,
      ...verification,
    });
  } catch (err) {
    return errorResponse('INTERNAL_ERROR', 'Failed to verify sources', 500, err);
  }
}
