import { env } from './env';
import type { NextRequest } from 'next/server';

export function verifyAdmin(req: NextRequest): boolean {
  const token =
    req.cookies.get('admin_token')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  
  return token === env.ADMIN_SECRET;
}

export function extractToken(req: NextRequest): string | null {
  return (
    req.cookies.get('admin_token')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null
  );
}
