import { setupConvexAuthServer } from '@convex-dev/auth/ssr';
import { api } from '@/convex/_generated/api';

export const auth = setupConvexAuthServer({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  refreshSession: api.auth.refreshSession,
  signOut: api.auth.signOut,
  signIn: [
    api.auth.signInWithUsernamePassword,
    api.auth.signUpWithUsernamePassword,
    api.auth.finishSignInWithUsernamePasskey,
    api.auth.finishSignUpWithUsernamePasskey,
  ],
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
});
