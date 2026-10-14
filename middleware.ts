import { NextResponse, type NextRequest } from 'next/server';

// Saringan awal di edge: tanpa cookie session → tolak. Pengecekan session & izin yang sebenarnya
// dilakukan di server (layout, server action, route handler) karena edge runtime tidak memakai Prisma.
const SESSION_COOKIE = 'cl_session';

export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Belum login.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/health|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
