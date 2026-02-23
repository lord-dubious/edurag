import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/voice')) {
    return NextResponse.next();
  }

  const onboardedCookie = request.cookies.get('edurag_onboarded')?.value;
  const hasEnvUrl = !!process.env.NEXT_PUBLIC_UNI_URL || !!process.env.NEXT_PUBLIC_APP_URL;
  const isOnboarded = onboardedCookie === 'true' || hasEnvUrl;

  if (!isOnboarded && pathname !== '/setup' && !pathname.startsWith('/api/onboarding') && !pathname.startsWith('/api/upload')) {
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
