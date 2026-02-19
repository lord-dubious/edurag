import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        <aside className="w-64 min-h-screen border-r bg-card p-4">
          <div className="font-bold text-lg mb-6">{process.env.NEXT_PUBLIC_APP_NAME || 'EduRAG'}</div>
          <nav className="space-y-2">
            <a href="/admin" className="block px-3 py-2 rounded-md hover:bg-muted">Dashboard</a>
            <a href="/admin/domains" className="block px-3 py-2 rounded-md hover:bg-muted">Domains</a>
            <a href="/admin/faqs" className="block px-3 py-2 rounded-md hover:bg-muted">FAQs</a>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
