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
  BookOpen,
  Sparkles
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
      { href: '/admin/knowledge-base', label: 'Crawl Settings', icon: BookOpen },
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
        <div className="relative h-6 w-auto max-w-[100px] flex items-center justify-center">
          <img 
            src={brand.logoUrl} 
            alt={name}
            className="h-full w-auto max-h-6 max-w-[100px] object-contain"
          />
        </div>
      );
    }

    if (brand?.emoji) {
      return <span className="text-xl">{brand.emoji}</span>;
    }

    return (
      <div className="p-1 rounded bg-primary/20">
        <Sparkles
          className="h-4 w-4 text-primary"
        />
      </div>
    );
  };

  const showTitle = brand?.showTitle !== false;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 glass-panel border-b border-white/5 z-50 flex items-center px-6">
        <div className="flex items-center gap-3">
          {renderLogo()}
          {showTitle && <span className="font-heading font-semibold text-lg tracking-tight">{name}</span>}
          <span 
            className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary uppercase tracking-wider"
          >
            Admin
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full hover:bg-white/5"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-full px-4"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <aside className="fixed left-0 top-16 bottom-0 w-64 glass-panel border-r border-white/5 flex flex-col pt-4">
        <nav className="flex-1 p-4 space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-4 py-2 mb-1">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-3 h-10 rounded-lg font-medium transition-all duration-200',
                          isActive
                            ? 'bg-primary/10 text-primary shadow-[0_0_15px_-5px_var(--color-primary)] hover:bg-primary/20'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        )}
                      >
                        <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
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
