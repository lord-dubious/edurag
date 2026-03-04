import { auth } from '@/auth';

export async function verifyAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === 'admin';
}
