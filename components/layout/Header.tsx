'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { useBrand } from '@/components/providers/BrandProvider';
import { Image as ImageIcon } from 'lucide-react';

export function Header() {
  const { brand, loading } = useBrand();

  const name = brand?.appName || 'Knowledge Base';

  const renderLogo = () => {
    if (loading) {
      return <div className="w-6 h-6 rounded bg-muted animate-pulse" />;
    }

    if ((brand?.iconType === 'logo' || brand?.iconType === 'upload') && brand.logoUrl) {
      return (
        <img 
          src={brand.logoUrl} 
          alt={name}
          className="h-6 w-auto object-contain"
        />
      );
    }

    if (brand?.emoji) {
      return <span className="text-xl">{brand.emoji}</span>;
    }

    return (
      <div 
        className="w-6 h-6 rounded flex items-center justify-center"
        style={{ backgroundColor: brand?.primaryColor || '#2563eb' }}
      >
        <ImageIcon className="w-3 h-3 text-white" />
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-sm transition-all">
      <div className="container mx-auto px-4 flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {renderLogo()}
          <span className="font-semibold text-lg">{name}</span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
