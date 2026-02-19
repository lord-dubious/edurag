'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Globe, 
  HelpCircle, 
  LogOut,
  Database
} from 'lucide-react';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/domains', label: 'Domains', icon: Globe },
  { href: '/admin/faqs', label: 'FAQs', icon: HelpCircle },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    window.location.href = '/admin/login';
  };

  return (
    <aside className="w-56 min-h-screen border-r bg-card flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">EduRAG</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Knowledge Base Admin</p>
      </div>
      
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-2',
                  isActive && 'bg-secondary'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
