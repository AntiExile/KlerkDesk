import { NextResponse, type NextRequest } from 'next/server';
import { convexAuthNextjsProxy } from '@/lib/convexAuth';
import {
  buildPublicRedirectUrl,
  rewriteSetCookiesForHttpsHeaders,
} from '@/lib/authProxyHelpers';

const AUTH_PAGES = new Set(['/login', '/signup']);

function isProtectedWorkspacePath(pathname: string): boolean {
  return (
    pathname === '/desk' ||
    pathname.startsWith('/desk/') ||
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname === '/vault' ||
    pathname.startsWith('/vault/') ||
    pathname === '/bid' ||
    pathname.startsWith('/bid/')
  );
}

const baseProxy = convexAuthNextjsProxy(async (request, { isAuthenticated }) => {
  const { pathname, searchParams } = request.nextUrl;
  const authed = await isAuthenticated();

  if (pathname === '/' && authed && searchParams.get('landing') !== 'true') {
    return NextResponse.redirect(buildPublicRedirectUrl(request, '/desk'));
  }

  if (pathname === '/signup' && authed) {
    return NextResponse.redirect(buildPublicRedirectUrl(request, '/onboarding'));
  }

  if (AUTH_PAGES.has(pathname) && authed) {
    return NextResponse.redirect(buildPublicRedirectUrl(request, '/desk'));
  }

  if (isProtectedWorkspacePath(pathname) && !authed) {
    return NextResponse.redirect(buildPublicRedirectUrl(request, '/login'));
  }
});

export default async function proxy(request: NextRequest) {
  const response = await baseProxy(request);
  rewriteSetCookiesForHttpsHeaders(response.headers, request.headers);
  return response;
}

export const config = {
  matcher: [
    '/((?!auth(?:/|$)|api(?:/|$)|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
