import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

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
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 min-h-screen">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
