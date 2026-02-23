import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  const onboardedCookie = request.cookies.get('edurag_onboarded')?.value;
  const isOnboarded = onboardedCookie === 'true';
  const hasRequiredEnv = !!(
    process.env.MONGODB_URI &&
    process.env.CHAT_API_KEY &&
    process.env.EMBEDDING_API_KEY &&
    process.env.TAVILY_API_KEY &&
    process.env.ADMIN_SECRET
  );

  if (!isOnboarded && !pathname.startsWith('/setup') && !pathname.startsWith('/api/onboarding') && !pathname.startsWith('/api/settings') && !pathname.startsWith('/api/upload') && !pathname.startsWith('/_next')) {
    if (hasRequiredEnv) {
      return NextResponse.next();
    }
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
