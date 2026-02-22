import { cookies } from 'next/headers';
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

  if (!token || token !== process.env.ADMIN_SECRET) {
    return <>{children}</>;
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrandProvider>
        <div className="min-h-screen bg-background">
          <AdminSidebar />
          <main className="ml-56 pt-14 min-h-screen">
            <div className="p-6">{children}</div>
          </main>
        </div>
        <Toaster position="bottom-right" />
      </BrandProvider>
    </ThemeProvider>
  );
}
