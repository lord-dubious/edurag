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
  Database,
  Moon,
  Sun,
  Settings,
  Image as ImageIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useBrand } from '@/components/providers/BrandProvider';

const navSections = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Knowledge Base',
    items: [
      { href: '/admin/domains', label: 'Domains', icon: Globe },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/faqs', label: 'FAQs', icon: HelpCircle },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { brand, loading } = useBrand();

  const name = brand?.appName || 'EduRAG';

  const handleLogout = () => {
    document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    window.location.href = '/admin/login';
  };

  const renderLogo = () => {
    if (loading) {
      return <div className="w-5 h-5 rounded bg-muted animate-pulse" />;
    }

    if ((brand?.iconType === 'logo' || brand?.iconType === 'upload') && brand.logoUrl) {
      return (
        <div className="relative h-5 w-auto max-w-[100px] flex items-center justify-center">
          <img 
            src={brand.logoUrl} 
            alt={name}
            className="h-full w-auto max-h-5 max-w-[100px] object-contain"
          />
        </div>
      );
    }

    if (brand?.emoji) {
      return <span className="text-lg">{brand.emoji}</span>;
    }

    return (
      <Database 
        className="h-5 w-5" 
        style={{ color: brand?.primaryColor || 'hsl(var(--primary))' }}
      />
    );
  };

  const showTitle = brand?.showTitle !== false;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-background border-b z-50 flex items-center px-4">
        <div className="flex items-center gap-2">
          {renderLogo()}
          {showTitle && <span className="font-semibold">{name}</span>}
          <span 
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ 
              backgroundColor: brand?.primaryColor ? `${brand.primaryColor}20` : 'hsl(var(--primary) / 0.1)',
              color: brand?.primaryColor || 'hsl(var(--primary))'
            }}
          >
            Admin
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <aside className="fixed left-0 top-14 bottom-0 w-56 border-r bg-muted/30 flex flex-col">
        <nav className="flex-1 p-3">
          {navSections.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 py-1.5">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-2',
                          isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
