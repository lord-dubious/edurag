import { cookies } from 'next/headers';
import crypto from 'crypto';
import { redirect } from 'next/navigation';

export async function requireAdmin(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const secret = process.env.ADMIN_SECRET;
  const tokenBuf = Buffer.from(token || '');
  const secretBuf = Buffer.from(secret || '');
  const isAuthed = Boolean(
    token &&
      secret &&
      tokenBuf.length === secretBuf.length &&
      crypto.timingSafeEqual(tokenBuf, secretBuf),
  );
  if (!isAuthed) {
    redirect('/admin/login');
  }
}
