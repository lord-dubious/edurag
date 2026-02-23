export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'AGENT_ERROR'
  | 'CRAWL_FAILED'
  | 'DB_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UPLOAD_FAILED'
  | 'INTERNAL_ERROR';

export interface AppError {
  error: string;
  code: AppErrorCode;
  details?: unknown;
}

export function errorResponse(
  code: AppErrorCode,
  message: string,
  status: number,
  err?: unknown,
): Response {
  const body: AppError = {
    error: message,
    code,
    ...(process.env.NODE_ENV === 'development' && err
      ? { details: err instanceof Error ? err.message : String(err) }
      : {}),
  };
  return Response.json(body, { status });
}
