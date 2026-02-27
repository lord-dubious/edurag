'use client';

import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { SunIcon, MoonIcon } from 'lucide-react';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  if (!resolvedTheme) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <SunIcon className="size-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
}
