'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
  const handleClick = (query: string) => {
    if (onSuggestionClick) {
      onSuggestionClick(query);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <p className="text-sm text-muted-foreground mb-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
        Quick suggestions
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {suggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          return (
            <div
              key={suggestion.label}
              className="animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-500 fill-mode-both"
              style={{ animationDelay: `${400 + index * 100}ms` }}
            >
              <Button
                variant="outline"
                className="w-full h-auto py-3 px-4 justify-start text-left gap-3 hover:bg-accent hover:border-primary/30 transition-all hover:shadow-sm"
                onClick={() => handleClick(suggestion.query)}
              >
                <Icon className="size-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium">{suggestion.label}</span>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
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
