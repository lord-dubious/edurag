import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { ThemeProvider } from 'next-themes';
import { BrandProvider } from '@/components/providers/BrandProvider';
import { Toaster } from '@/components/ui/sonner';
import { verifyAdmin } from '@/lib/admin-auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await verifyAdmin())) {
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
