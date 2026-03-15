'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function LoginButton() {
  return (
    <Button variant='outline' size='sm' asChild>
      <Link href='/auth/signin'>Sign In</Link>
    </Button>
  );
}
