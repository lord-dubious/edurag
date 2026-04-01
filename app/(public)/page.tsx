import { Hero } from '@/components/landing/Hero';
import { FaqSection } from '@/components/landing/FaqSection';
import { SuggestionChipsWrapper } from '@/components/landing/SuggestionChips';
import { Header } from '@/components/layout/Header';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  return (
    <div className='min-h-screen flex flex-col'>
      <Header />

      <main className='flex-1'>
        <Hero />
        <SuggestionChipsWrapper />
        <FaqSection />
      </main>

      <footer className='px-4 pb-6 pt-2 sm:px-6'>
        <div className='mx-auto flex h-14 w-full max-w-6xl items-center justify-center rounded-2xl border border-white/60 bg-background/80 text-sm text-muted-foreground backdrop-blur-md dark:border-white/10'>
          Powered by EduRAG
        </div>
      </footer>
    </div>
  );
}
