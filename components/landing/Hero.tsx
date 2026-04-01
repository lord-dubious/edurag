'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, Image as ImageIcon, Mic2, Phone } from 'lucide-react';
import { PromptInput, PromptInputBody, PromptInputButton, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@/components/ai-elements/prompt-input';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';
import { authClient } from '@/lib/auth-client-better';
import { useBrand } from '@/components/providers/BrandProvider';

const HERO_QUICK_STARTS = [
  'What are the admission requirements for international students?',
  'How much is tuition and what aid is available?',
  'Show deadlines for undergraduate programs.',
];

export function Hero(): React.JSX.Element {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { brand, loading } = useBrand();
  const [showVoiceHint, setShowVoiceHint] = useState(false);

  const name = brand?.appName || 'University Knowledge Base';

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    const encodedQuery = encodeURIComponent(message.text);
    router.push(`/chat?q=${encodedQuery}`);
  }, [router]);

  const handleVoiceStart = useCallback(() => {
    if (!session?.user) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/chat?voice=1')}`);
      return;
    }
    router.push('/chat?voice=1');
  }, [router, session?.user]);

  const handleQuickStart = useCallback((query: string) => {
    router.push(`/chat?q=${encodeURIComponent(query)}`);
  }, [router]);

  const renderLogo = () => {
    if (loading) {
      return <div className='h-16 w-16 animate-pulse rounded-2xl bg-muted' />;
    }

    if ((brand?.iconType === 'logo' || brand?.iconType === 'upload') && brand.logoUrl) {
      return (
        <div className='relative flex h-16 w-auto max-w-[220px] items-center justify-center rounded-2xl bg-background/75 px-3 py-2 shadow-sm ring-1 ring-white/45'>
          <img
            src={brand.logoUrl}
            alt={name}
            className='h-full max-h-12 w-auto max-w-[200px] object-contain'
          />
        </div>
      );
    }

    if (brand?.emoji) {
      return (
        <div
          className='flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm'
          style={{ backgroundColor: brand.primaryColor ? `${brand.primaryColor}2c` : undefined }}
        >
          {brand.emoji}
        </div>
      );
    }

    return (
      <div
        className='flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm'
        style={{ backgroundColor: brand?.primaryColor || '#2563eb' }}
      >
        <ImageIcon className='h-8 w-8 text-white' />
      </div>
    );
  };

  return (
    <section className='brand-aurora relative min-h-[calc(100svh-5.5rem)] px-4 pb-14 pt-5 sm:px-6 sm:pt-8'>
      <div className='mx-auto grid w-full max-w-6xl grid-cols-1 gap-9 lg:grid-cols-12 lg:gap-10'>
        <div className='lg:col-span-7'>
          <div className='animate-in fade-in slide-in-from-bottom-4 duration-700'>
            <div className='mb-5 inline-flex items-center gap-2 rounded-full border border-white/70 bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground shadow-sm backdrop-blur'>
              <BookOpen className='size-3.5' />
              Trusted answers with citations
            </div>
            <div className='mb-4'>{renderLogo()}</div>
            <p className='mb-3 text-sm font-medium tracking-wide text-muted-foreground'>{name}</p>
            <h1 className='max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl'>
              Ask once. Get answers grounded in your institution&apos;s official knowledge.
            </h1>
            <p className='mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg'>
              Admissions, tuition, deadlines, campus life, and program details in one assistant that speaks and writes with source-backed responses.
            </p>
          </div>

          <div className='mt-9 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150 fill-mode-both'>
            <PromptInput onSubmit={handleSubmit} className='surface-glass w-full rounded-2xl shadow-[0_22px_36px_-24px_rgba(0,0,0,0.55)]'>
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder='Start with a question about programs, tuition, or deadlines...'
                  className='min-h-[56px] bg-transparent text-base placeholder:text-muted-foreground/80'
                />
              </PromptInputBody>
              <PromptInputFooter className='rounded-b-2xl border-t border-white/35 bg-transparent p-2.5 dark:border-white/10'>
                <div className='hidden text-xs text-muted-foreground sm:block'>
                  Try: &quot;What scholarships can first-year students apply for?&quot;
                </div>
                <div className='flex items-center gap-2'>
                  <PromptInputButton
                    onClick={handleVoiceStart}
                    onMouseEnter={() => setShowVoiceHint(true)}
                    onMouseLeave={() => setShowVoiceHint(false)}
                    onFocus={() => setShowVoiceHint(true)}
                    onBlur={() => setShowVoiceHint(false)}
                    title='Start voice'
                    aria-label='Start voice chat'
                    className='brand-glow-dot rounded-lg bg-primary px-2.5 py-2 text-primary-foreground shadow-sm transition hover:bg-primary/90'
                  >
                    <Phone className='size-4' />
                  </PromptInputButton>
                  <PromptInputSubmit status={'ready' as ChatStatus} className='rounded-lg bg-primary text-primary-foreground hover:bg-primary/90' />
                </div>
              </PromptInputFooter>
            </PromptInput>
            {showVoiceHint && (
              <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                <span className='inline-flex items-center gap-1.5'>
                  <Mic2 className='size-3.5' />
                  Start a live voice session
                </span>
                {!session?.user && <span>Sign in required for voice</span>}
              </div>
            )}
          </div>
        </div>

        <aside className='animate-in fade-in slide-in-from-right-5 duration-700 delay-200 fill-mode-both lg:col-span-5'>
          <div className='surface-glass rounded-3xl p-5 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.65)]'>
            <p className='mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
              Quick starts
            </p>
            <h2 className='text-xl font-semibold tracking-tight sm:text-2xl'>
              Popular questions students ask first
            </h2>
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              Pick one to jump into chat instantly, or use the input box to ask your own question.
            </p>

            <div className='mt-5 space-y-2.5'>
              {HERO_QUICK_STARTS.map((item) => (
                <button
                  key={item}
                  type='button'
                  onClick={() => handleQuickStart(item)}
                  className='group flex w-full items-start justify-between gap-3 rounded-xl border border-white/55 bg-background/75 px-3.5 py-3 text-left text-sm leading-relaxed transition hover:border-primary/35 hover:bg-background'
                >
                  <span className='text-foreground/95'>{item}</span>
                  <ArrowRight className='mt-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary' />
                </button>
              ))}
            </div>

            <div className='mt-5 rounded-xl border border-dashed border-primary/35 bg-primary/10 px-3.5 py-3 text-xs text-muted-foreground'>
              Every answer can include source links so students can verify details quickly.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
