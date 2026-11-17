import { setupConvexAuth } from '@convex-dev/auth/server';
import { setupUsernamePasskey } from '@convex-dev/auth/methods/username-passkey/server';
import { setupUsernamePassword } from '@convex-dev/auth/methods/username-password/server';
import { components, internal } from './_generated/api';
import { env } from './_generated/server';

const auth = setupConvexAuth({ component: components.auth });

export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  signUpWithUsernamePassword,
  signInWithUsernamePassword,
  changePassword,
} = setupUsernamePassword(auth, {
  component: components.authPassword,
  usernameComponent: components.authUsername,
}).attachUserCallbacks({
  createUser: internal.users.createUser,
  onSignIn: internal.users.onSignIn,
});

export const {
  startSignInWithUsernamePasskey,
  startAutofillSignInWithUsernamePasskey,
  finishSignUpWithUsernamePasskey,
  finishSignInWithUsernamePasskey,
} = setupUsernamePasskey(auth, {
  component: components.authPasskey,
  usernameComponent: components.authUsername,
  rpId: env.PASSKEY_RP_ID ?? 'localhost',
  origin: env.PASSKEY_ORIGIN?.split(',') ?? 'http://localhost:3000',
}).attachUserCallbacks({
  createUser: internal.users.createUser,
  onSignIn: internal.users.onSignIn,
});
