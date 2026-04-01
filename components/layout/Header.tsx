'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client-better';
import { ArrowRight, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { useBrand } from '@/components/providers/BrandProvider';

export function Header(): React.JSX.Element {
  const { data: session, isPending } = useSession();
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
    <header className='sticky top-0 z-50 w-full px-3 py-3 sm:px-5'>
      <div className='mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-2xl border border-white/60 bg-background/85 px-3 shadow-[0_12px_28px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md dark:border-white/10 dark:bg-background/75 sm:px-4'>
        <Link href='/' className='flex min-w-0 items-center gap-3'>
          <div className='shrink-0'>{renderLogo()}</div>
          {showTitle && (
            <div className='min-w-0'>
              <span className='block truncate text-sm font-semibold tracking-tight sm:text-base'>
                {name}
              </span>
              <span className='hidden text-[11px] text-muted-foreground sm:block'>
                University knowledge assistant
              </span>
            </div>
          )}
        </Link>

        <div className='flex items-center gap-1.5 sm:gap-2'>
          <Button size='sm' variant='ghost' asChild className='hidden sm:inline-flex'>
            <Link href='/chat' className='gap-1.5'>
              Open chat
              <ArrowRight className='size-3.5' />
            </Link>
          </Button>
          <ThemeToggle />

          {isPending ? (
            <div className='h-8 w-[160px] animate-pulse rounded-md bg-muted' />
          ) : session?.user ? (
            <UserMenu />
          ) : (
            <>
              <Button variant='ghost' size='sm' asChild className='hidden sm:inline-flex'>
                <Link href='/auth/signin'>Sign in</Link>
              </Button>
              <Button size='sm' asChild className='px-3'>
                <Link href='/auth/signin?tab=register'>Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
