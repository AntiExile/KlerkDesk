export function getForwardedHost(headers: Headers): string | null {
  const raw = headers.get('x-forwarded-host');
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first || null;
}

export function getForwardedProto(headers: Headers): string | null {
  const raw = headers.get('x-forwarded-proto');
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim().toLowerCase();
  return first || null;
}

export function isLocalHost(hostWithOptionalPort: string | null): boolean {
  if (!hostWithOptionalPort) return true;
  const trimmed = hostWithOptionalPort.trim().toLowerCase();
  if (!trimmed) return true;

  const hostname = trimmed.startsWith('[')
    ? trimmed.slice(0, trimmed.indexOf(']') + 1)
    : (trimmed.split(':')[0] ?? '');

  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Detects whether a request originated from a public HTTPS proxy (such as
 * Cloud Run + nginx). Note that nginx listening on container port 8080 sets
 * `proxy_set_header X-Forwarded-Proto $scheme` (`http`), so we also check
 * `Origin`, `Referer`, and whether `X-Forwarded-Host` / `Host` is a non-local
 * public domain.
 */
export function isHttpsProxyRequest(headers: Headers): boolean {
  const proto = getForwardedProto(headers);
  if (proto === 'https') {
    return true;
  }

  const origin = headers.get('origin');
  if (origin && origin.toLowerCase().startsWith('https://')) {
    return true;
  }

  const referer = headers.get('referer');
  if (referer && referer.toLowerCase().startsWith('https://')) {
    return true;
  }

  const forwardedHost = getForwardedHost(headers);
  if (forwardedHost && !isLocalHost(forwardedHost)) {
    return true;
  }

  const host = headers.get('host');
  if (host && !isLocalHost(host)) {
    return true;
  }

  return false;
}

export function buildPublicRedirectUrl(request: Request, pathname: string): URL {
  const forwardedHost = getForwardedHost(request.headers);
  if (forwardedHost) {
    const proto = isHttpsProxyRequest(request.headers)
      ? 'https'
      : (getForwardedProto(request.headers) ?? 'http');
    return new URL(pathname, `${proto}://${forwardedHost}`);
  }
  return new URL(pathname, request.url);
}

/**
 * Restores the public `Host` from `X-Forwarded-Host` so `@convex-dev/auth`'s
 * `isTrustedOrigin` CSRF check compares `Origin` against the actual proxy host
 * (e.g., `ais-dev-*.run.app`) instead of the internal `localhost:3000` rewrite,
 * while still rejecting mismatched cross-site `Origin` headers.
 */
export async function normalizeAuthProxyRequest(
  request: Request
): Promise<Request> {
  const forwardedHost = getForwardedHost(request.headers);
  const currentHost = request.headers.get('host');
  if (!forwardedHost || forwardedHost === currentHost) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set('host', forwardedHost);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;

  return new Request(request.url, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });
}

export function upgradeCookieForHttpsIframe(cookieHeader: string): string {
  if (!cookieHeader.startsWith('__convexAuth')) {
    return cookieHeader;
  }

  let updated = cookieHeader.replace(/;\s*SameSite=(Lax|Strict)/i, '; SameSite=None');
  if (!/;\s*SameSite=/i.test(updated)) {
    updated += '; SameSite=None';
  }
  if (!/;\s*Secure(?:;|$)/i.test(updated)) {
    updated += '; Secure';
  }
  if (!/;\s*Partitioned(?:;|$)/i.test(updated)) {
    updated += '; Partitioned';
  }
  return updated;
}

export function rewriteSetCookiesForHttpsHeaders(
  headers: Headers,
  requestHeaders: Headers
): void {
  if (!isHttpsProxyRequest(requestHeaders)) return;

  const existingCookies =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (existingCookies.length === 0) return;

  const hasConvexCookie = existingCookies.some((c) =>
    c.startsWith('__convexAuth')
  );
  if (!hasConvexCookie) return;

  headers.delete('set-cookie');
  for (const cookie of existingCookies) {
    headers.append('set-cookie', upgradeCookieForHttpsIframe(cookie));
  }
}

export function withForwardedAuthProxy(
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const normalizedRequest = await normalizeAuthProxyRequest(request);
    const response = await handler(normalizedRequest);

    if (!isHttpsProxyRequest(request.headers)) {
      return response;
    }

    const headers = new Headers(response.headers);
    rewriteSetCookiesForHttpsHeaders(headers, request.headers);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
