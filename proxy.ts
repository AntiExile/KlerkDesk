import { convexAuthNextjsProxy, nextjsProxyRedirect } from '@/lib/convexAuth';

const AUTH_PAGES = new Set(['/login', '/signup']);

function isProtectedWorkspacePath(pathname: string): boolean {
  return (
    pathname === '/desk' ||
    pathname.startsWith('/desk/') ||
    pathname === '/vault' ||
    pathname.startsWith('/vault/') ||
    pathname === '/bid' ||
    pathname.startsWith('/bid/')
  );
}

export default convexAuthNextjsProxy(async (request, { isAuthenticated }) => {
  const { pathname, searchParams } = request.nextUrl;
  const authed = await isAuthenticated();

  if (pathname === '/' && authed && searchParams.get('landing') !== 'true') {
    return nextjsProxyRedirect(request, '/desk');
  }

  if (AUTH_PAGES.has(pathname) && authed) {
    return nextjsProxyRedirect(request, '/desk');
  }

  if (isProtectedWorkspacePath(pathname) && !authed) {
    return nextjsProxyRedirect(request, '/login');
  }
});

export const config = {
  matcher: [
    '/((?!auth(?:/|$)|api(?:/|$)|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
