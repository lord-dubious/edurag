import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ONBOARDING_COMPLETE = process.env.NEXT_PUBLIC_ONBOARDING_COMPLETE === 'true';
const isOnboarded = ONBOARDING_COMPLETE || !!process.env.NEXT_PUBLIC_UNI_URL;

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!isOnboarded && pathname !== '/setup' && !pathname.startsWith('/api/onboarding')) {
    return NextResponse.redirect(new URL('/setup', request.url));
  }

  if (isOnboarded && pathname === '/setup') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_token')?.value
      ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    
    if (!token || token !== process.env.ADMIN_SECRET) {
      if (pathname === '/admin/login') {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  if (pathname.startsWith('/api/crawl') || pathname.startsWith('/api/domains')) {
    const token = request.cookies.get('admin_token')?.value
      ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    
    if (!token || token !== process.env.ADMIN_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/crawl/:path*', '/api/domains/:path*', '/setup', '/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
};
