import { Hero } from '@/components/landing/Hero';
import { FaqSection } from '@/components/landing/FaqSection';
import { SuggestionChipsWrapper } from '@/components/landing/SuggestionChips';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { Header } from '@/components/layout/Header';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <Hero />
        <div className="container mx-auto px-4 pb-8">
          <SuggestionChipsWrapper />
        </div>
        <FaqSection />
      </main>

      <footer className="border-t py-6 md:py-0">
        <div className="container mx-auto px-4 flex h-14 items-center justify-center text-sm text-muted-foreground">
          Powered by EduRAG
        </div>
      </footer>
    </div>
  );
}
