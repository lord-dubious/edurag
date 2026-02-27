'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { useBrand } from '@/components/providers/BrandProvider';

export function Header(): React.JSX.Element {
  const { data: session } = useSession();
  const { brand, loading } = useBrand();

  const name = brand?.appName || 'Knowledge Base';
  const showTitle = brand?.showTitle !== false;

  const renderLogo = (): React.JSX.Element => {
    if (loading) {
      return <div className='w-8 h-8 rounded bg-muted animate-pulse' />;
    }

    if ((brand?.iconType === 'logo' || brand?.iconType === 'upload') && brand.logoUrl) {
      return (
        <div className='relative h-8 w-auto max-w-[120px] flex items-center justify-center'>
          <Image
            src={brand.logoUrl}
            alt={name}
            width={120}
            height={32}
            className='h-full w-auto max-h-8 max-w-[120px] object-contain'
            unoptimized
          />
        </div>
      );
    }

    if (brand?.emoji) {
      return (
        <div
          className='w-8 h-8 rounded-lg flex items-center justify-center text-xl'
          style={{ backgroundColor: brand?.primaryColor ? `${brand.primaryColor}20` : undefined }}
        >
          {brand.emoji}
        </div>
      );
    }

    return (
      <div
        className='w-8 h-8 rounded-lg flex items-center justify-center'
        style={{ backgroundColor: brand?.primaryColor || '#2563eb' }}
      >
        <ImageIcon className='w-4 h-4 text-white' />
      </div>
    );
  };

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-sm transition-all'>
      <div className='container mx-auto px-4 flex h-14 items-center justify-between'>
        <Link href='/' className='flex items-center gap-3 group'>
          {renderLogo()}
          {showTitle && (
            <span className='font-semibold text-lg group-hover:text-primary transition-colors'>
              {name}
            </span>
          )}
        </Link>
        <div className='flex items-center gap-2'>
          <ThemeToggle />
          {session?.user ? (
            <UserMenu />
          ) : (
            <>
              <Button variant='outline' size='sm' asChild>
                <Link href='/auth/signin'>Sign in</Link>
              </Button>
              <Button size='sm' asChild>
                <Link href='/auth/signin?tab=register'>Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
