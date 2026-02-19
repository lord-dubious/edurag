import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
  matcher: ['/admin/:path*', '/api/crawl/:path*', '/api/domains/:path*'],
};
