'use client';

import { useRouter } from 'next/navigation';
import { GraduationCapIcon, DollarSignIcon, ClipboardListIcon, HomeIcon, BookOpenIcon, UsersIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Suggestion {
  label: string;
  query: string;
  icon: LucideIcon;
}

const suggestions: Suggestion[] = [
  { label: 'Programs', query: 'What programs are offered?', icon: GraduationCapIcon },
  { label: 'Tuition', query: 'How much is tuition?', icon: DollarSignIcon },
  { label: 'Admissions', query: 'What are the admission requirements?', icon: ClipboardListIcon },
  { label: 'Campus Life', query: 'Tell me about campus life', icon: HomeIcon },
  { label: 'Courses', query: 'What courses are available?', icon: BookOpenIcon },
  { label: 'Student Services', query: 'What student services are available?', icon: UsersIcon },
];

interface SuggestionChipsProps {
  onSuggestionClick?: (query: string) => void;
}

export function SuggestionChips({ onSuggestionClick }: SuggestionChipsProps) {
  return (
    <section className='mx-auto w-full max-w-6xl px-4 pb-4'>
      <div className='surface-glass rounded-2xl px-4 py-4 sm:px-5'>
        <div className='mb-3 flex items-center justify-between gap-2'>
          <p className='text-xs font-semibold uppercase tracking-[0.17em] text-muted-foreground'>
            Guided prompts
          </p>
          <span className='text-xs text-muted-foreground'>Tap to launch in chat</span>
        </div>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={suggestion.label}
                type='button'
                className='animate-in fade-in zoom-in-95 rounded-xl border border-white/60 bg-background/80 px-3 py-3 text-left transition hover:border-primary/35 hover:bg-background'
                style={{ animationDelay: `${index * 70}ms` }}
                onClick={() => onSuggestionClick?.(suggestion.query)}
              >
                <Icon className='mb-2 size-4 text-primary' />
                <span className='block text-sm font-medium leading-tight'>{suggestion.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SuggestionChipsWrapper() {
  const router = useRouter();

  const handleSuggestionClick = (query: string) => {
    const encodedQuery = encodeURIComponent(query);
    router.push(`/chat?q=${encodedQuery}`);
  };

  return <SuggestionChips onSuggestionClick={handleSuggestionClick} />;
}
