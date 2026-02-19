'use client';

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
      <p className="text-sm text-muted-foreground mb-3 text-center">
        Quick suggestions
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <Button
              key={suggestion.label}
              variant="outline"
              className="h-auto py-3 px-4 justify-start text-left gap-3 hover:bg-accent"
              onClick={() => handleClick(suggestion.query)}
            >
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm">{suggestion.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
