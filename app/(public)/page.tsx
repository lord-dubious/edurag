import { Hero } from '@/components/landing/Hero';
import { FaqSection } from '@/components/landing/FaqSection';
import { SuggestionChipsWrapper } from '@/components/landing/SuggestionChips';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { MessageSquareIcon } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 3600;

export default async function HomePage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Knowledge Base';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <MessageSquareIcon className="size-5 text-primary" />
            <span className="font-semibold">{appName}</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <Hero appName={appName} />
        <div className="container mx-auto px-4 pb-8">
          <SuggestionChipsWrapper />
        </div>
        <FaqSection />
      </main>

      <footer className="border-t py-4">
        <div className="container flex items-center justify-center text-xs text-muted-foreground">
          {appName} · Powered by EduRAG
        </div>
      </footer>
    </div>
  );
}
