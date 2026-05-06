import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/lock'];
const PUBLIC_API_PREFIXES = ['/api/auth'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths - no auth needed
  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Static assets and _next - skip
  if (pathname.startsWith('/_next') || pathname.includes('.')) return NextResponse.next();

  // Check auth cookie
  const operatorName = req.cookies.get('operator_name')?.value;
  if (!operatorName) {
    return NextResponse.redirect(new URL('/lock', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
