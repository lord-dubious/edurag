import { cookies } from 'next/headers';
import crypto from 'crypto';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { ThemeProvider } from 'next-themes';
import { BrandProvider } from '@/components/providers/BrandProvider';
import { Toaster } from '@/components/ui/sonner';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrandProvider>
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40">
          {isAuthed && <AdminSidebar />}
          <main className={isAuthed ? 'ml-56 pt-14 min-h-screen' : 'min-h-screen'}>
            <div className={isAuthed ? 'p-6 lg:p-10 max-w-6xl mx-auto' : ''}>{children}</div>
          </main>
        </div>
        <Toaster position="bottom-right" />
      </BrandProvider>
    </ThemeProvider>
  );
}
