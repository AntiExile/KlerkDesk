import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedOrigin } from '@convex-dev/auth/ssr';
import {
  buildPublicRedirectUrl,
  normalizeAuthProxyRequest,
  upgradeCookieForHttpsIframe,
  withForwardedAuthProxy,
} from './authProxyHelpers';

test('normalizeAuthProxyRequest fixes CSRF origin check behind X-Forwarded-Host proxy while blocking evil origins', async () => {
  const previewOrigin =
    'https://ais-dev-5kkqoeuy6psp5fcow7vpg4-346334267214.europe-west2.run.app';
  const previewHost =
    'ais-dev-5kkqoeuy6psp5fcow7vpg4-346334267214.europe-west2.run.app';

  const validProxiedReq = new Request('http://localhost:3000/auth/signin?path=/api/mutation', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': previewHost,
      'x-forwarded-proto': 'https',
      origin: previewOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path: 'auth:signUpWithUsernamePassword' }),
  });

  assert.equal(isTrustedOrigin(validProxiedReq), false);

  const normalized = await normalizeAuthProxyRequest(validProxiedReq);
  assert.equal(normalized.headers.get('host'), previewHost);
  assert.equal(isTrustedOrigin(normalized), true);
  assert.deepEqual(await normalized.json(), {
    path: 'auth:signUpWithUsernamePassword',
  });

  const crossSiteReq = new Request('http://localhost:3000/auth/signin?path=/api/mutation', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': previewHost,
      'x-forwarded-proto': 'https',
      origin: 'https://attacker.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const normalizedCrossSite = await normalizeAuthProxyRequest(crossSiteReq);
  assert.equal(isTrustedOrigin(normalizedCrossSite), false);
});

test('withForwardedAuthProxy upgrades __convexAuth cookies for HTTPS iframe previews', async () => {
  const wrapped = withForwardedAuthProxy(async () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append(
      'set-cookie',
      '__convexAuthJWT=abc; Path=/; HttpOnly; SameSite=Lax'
    );
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  });

  const proxiedReq = new Request('http://localhost:3000/auth/signin', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': 'preview.example.run.app',
      'x-forwarded-proto': 'https',
      origin: 'https://preview.example.run.app',
    },
  });

  const res = await wrapped(proxiedReq);
  const cookies = res.headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /SameSite=None/);
  assert.match(cookies[0], /Secure/);
  assert.match(cookies[0], /Partitioned/);

  assert.equal(
    upgradeCookieForHttpsIframe('other=1; Path=/; SameSite=Lax'),
    'other=1; Path=/; SameSite=Lax'
  );
});

test('buildPublicRedirectUrl uses https for public X-Forwarded-Host even when nginx sets X-Forwarded-Proto: http', () => {
  const reqHttps = new Request('http://localhost:3000/desk', {
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': 'preview.example.run.app',
      'x-forwarded-proto': 'https',
    },
  });

  assert.equal(
    buildPublicRedirectUrl(reqHttps, '/login').toString(),
    'https://preview.example.run.app/login'
  );

  // Container nginx on port 8080 sets `X-Forwarded-Proto: http` ($scheme) even
  // though Cloud Run serves the public domain over HTTPS.
  const reqNginxHttpScheme = new Request('http://localhost:3000/desk?_rsc=123', {
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host':
        'ais-dev-5kkqoeuy6psp5fcow7vpg4-346334267214.europe-west2.run.app',
      'x-forwarded-proto': 'http',
    },
  });

  assert.equal(
    buildPublicRedirectUrl(reqNginxHttpScheme, '/login').toString(),
    'https://ais-dev-5kkqoeuy6psp5fcow7vpg4-346334267214.europe-west2.run.app/login'
  );

  // Localhost requests remain http://
  const reqLocal = new Request('http://localhost:3000/desk', {
    headers: {
      host: 'localhost:3000',
    },
  });
  assert.equal(
    buildPublicRedirectUrl(reqLocal, '/login').toString(),
    'http://localhost:3000/login'
  );
});

test('withForwardedAuthProxy upgrades cookies when X-Forwarded-Host is public even if X-Forwarded-Proto is http', async () => {
  const wrapped = withForwardedAuthProxy(async () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append(
      'set-cookie',
      '__convexAuthRefreshToken=tok; Path=/; HttpOnly; SameSite=Lax'
    );
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  });

  const nginxProxiedReq = new Request('http://localhost:3000/auth/signin', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host':
        'ais-dev-5kkqoeuy6psp5fcow7vpg4-346334267214.europe-west2.run.app',
      'x-forwarded-proto': 'http',
      origin:
        'https://ais-dev-5kkqoeuy6psp5fcow7vpg4-346334267214.europe-west2.run.app',
    },
  });

  const res = await wrapped(nginxProxiedReq);
  const cookies = res.headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /SameSite=None/);
  assert.match(cookies[0], /Secure/);
  assert.match(cookies[0], /Partitioned/);
});
