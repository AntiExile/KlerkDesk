import { auth } from '@/lib/serverAuth';
import { withForwardedAuthProxy } from '@/lib/authProxyHelpers';

export const POST = withForwardedAuthProxy(auth.convexProxyHandler);
