import { NextResponse } from 'next/server';
import { auth } from './auth';
import { checkRateLimit } from '@/lib/rate-limiter';

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  if (process.env.NODE_ENV === 'production') {
    const proto = request.headers.get('x-forwarded-proto');
    if (proto && !proto.includes('https')) {
      const host = request.headers.get('host');
      if (host) {
        return NextResponse.redirect(`https://${host}${request.nextUrl.pathname}${request.nextUrl.search}`);
      }
    }
  }
  if (pathname === '/api/chat') {
    const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    const allowed = checkRateLimit(`chat:${ip}`, 20, 60_000); // 20 per minute
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
      );
    }
  }

  const onboardedCookie = request.cookies.get('edurag_onboarded')?.value;
  const isOnboarded = onboardedCookie === 'true';
  const hasRequiredEnv = !!(
    process.env.MONGODB_URI &&
    process.env.CHAT_API_KEY &&
    process.env.EMBEDDING_API_KEY &&
    process.env.TAVILY_API_KEY
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

  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && pathname !== '/auth/signin') {
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  if (
    (pathname.startsWith('/api/crawl') ||
      pathname.startsWith('/api/domains') ||
      (pathname.startsWith('/api/faqs') && request.method !== 'GET')) &&
    session?.user?.role !== 'admin'
  ) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*', '/api/crawl/:path*', '/api/domains/:path*', '/setup', '/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
};
