'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from '@convex-dev/auth/methods/username-password/react';
import { DEFAULT_MIN_PASSWORD_LENGTH } from '@convex-dev/auth/methods/username-password';
import { ArrowRight, Loader2, Play, ShieldCheck } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { KlerkBrandLink } from '@/components/landing/KlerkLogo';

const DEMO_USERNAME = 'demo@mundusmk.co.za';
const DEMO_PASSWORD = 'KlerkDesk-Demo-2026!#Pilot';

function formatSignInError(
  result: Awaited<ReturnType<ReturnType<typeof useSignInWithUsernamePassword>['signIn']>>
): string {
  if (result.status === 'complete') return '';
  const { userError } = result;
  switch (userError.error) {
    case 'USER_NOT_FOUND':
      return 'No account exists with that email or username.';
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email/username or password.';
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${userError.minimumLength} characters.`;
    case 'PASSWORD_TOO_LONG':
      return `Password must be at most ${userError.maximumLength} characters.`;
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return 'Password cannot start or end with whitespace.';
    case 'RATE_LIMITED':
      return `Too many attempts. Try again in ${Math.ceil(userError.retryAfterMs / 1000)} seconds.`;
    case 'OTHER_ERROR':
      console.error('Sign-in failed:', userError.cause);
      return 'Unable to sign in right now. Please try again.';
    default: {
      const _exhaustive: never = userError;
      void _exhaustive;
      return 'Unable to sign in right now. Please try again.';
    }
  }
}

function formatSignUpError(
  result: Awaited<ReturnType<ReturnType<typeof useSignUpWithUsernamePassword>['signUp']>>
): string {
  if (result.status === 'complete') return '';
  const { userError } = result;
  switch (userError.error) {
    case 'USERNAME_TAKEN':
      return 'That email/username is already registered. Try logging in instead.';
    case 'USERNAME_TOO_SHORT':
      return `Email/username must be at least ${userError.minimumLength} characters.`;
    case 'USERNAME_TOO_LONG':
      return `Email/username must be at most ${userError.maximumLength} characters.`;
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
      return 'Email/username cannot start or end with whitespace.';
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return 'Email/username contains unsupported characters.';
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${userError.minimumLength} characters.`;
    case 'PASSWORD_TOO_LONG':
      return `Password must be at most ${userError.maximumLength} characters.`;
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return 'Password cannot start or end with whitespace.';
    case 'PASSWORD_TOO_COMMON':
      return 'Please choose a stronger, less common password.';
    case 'OTHER_ERROR':
      console.error('Sign-up failed:', userError.cause);
      return 'Unable to create account right now. Please try again.';
    default: {
      const _exhaustive: never = userError;
      void _exhaustive;
      return 'Unable to create account right now. Please try again.';
    }
  }
}

export function AuthCard({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const { signIn, pending: signInPending } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signUpPending } = useSignUpWithUsernamePassword(api.auth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [demoPending, setDemoPending] = useState(false);
  const demoAutoStartedRef = useRef(false);

  const isBusy = signInPending || signUpPending || demoPending;

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/desk');
    }
  }, [isAuthenticated, router]);

  const handleDemoSandbox = async () => {
    setError(null);
    setDemoPending(true);
    try {
      const loginResult = await signIn({
        username: DEMO_USERNAME,
        password: DEMO_PASSWORD,
      });

      if (loginResult.status === 'complete') {
        router.replace('/desk');
        router.refresh();
        return;
      }

      if (loginResult.userError.error === 'USER_NOT_FOUND') {
        const signUpResult = await signUp({
          username: DEMO_USERNAME,
          password: DEMO_PASSWORD,
        });

        if (signUpResult.status === 'complete') {
          router.replace('/desk');
          router.refresh();
          return;
        }

        setError(formatSignUpError(signUpResult));
        return;
      }

      setError(formatSignInError(loginResult));
    } finally {
      setDemoPending(false);
    }
  };

  useEffect(() => {
    if (
      mode === 'login' &&
      searchParams.get('demo') === 'true' &&
      !demoAutoStartedRef.current &&
      !isAuthenticated
    ) {
      demoAutoStartedRef.current = true;
      void handleDemoSandbox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, searchParams, isAuthenticated]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      const result = await signIn({ username: username.trim(), password });
      if (result.status === 'complete') {
        router.replace('/desk');
        router.refresh();
        return;
      }
      setError(formatSignInError(result));
      return;
    }

    const result = await signUp({ username: username.trim(), password });
    if (result.status === 'complete') {
      router.replace('/desk');
      router.refresh();
      return;
    }
    setError(formatSignUpError(result));
  };

  return (
    <div className="min-h-dvh bg-[#0A0A0B] text-zinc-100 flex flex-col justify-between px-4 py-8">
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <KlerkBrandLink href="/?landing=true" />
        <Link
          href="/?landing=true"
          className="text-xs text-zinc-400 hover:text-white no-underline transition-colors"
        >
          Back to overview
        </Link>
      </div>

      <main className="w-full max-w-md mx-auto my-8">
        <div className="bg-[#111113] border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/80 space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-[11px] font-medium text-emerald-300">
              <ShieldCheck className="size-3" />
              <span>Convex Auth • POPIA Isolated</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white m-0 pt-1">
              {mode === 'login' ? 'Sign in to KlerkDesk' : 'Launch your KlerkDesk workspace'}
            </h1>
            <p className="text-xs text-zinc-400 m-0">
              {mode === 'login'
                ? 'Access your Compliance Vault, BoQ bid room, and Approval Shield.'
                : 'Start your 14-day South African contractor pilot in seconds.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Work Email or Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="director@karoocivil.co.za"
                disabled={isBusy}
                className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={DEFAULT_MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={`At least ${DEFAULT_MIN_PASSWORD_LENGTH} characters`}
                disabled={isBusy}
                className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-200"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white text-black hover:bg-zinc-200 py-2.5 text-sm font-semibold border-none cursor-pointer transition-colors disabled:opacity-50"
            >
              {(signInPending || signUpPending) && (
                <Loader2 className="size-4 animate-spin" />
              )}
              <span>
                {mode === 'login' ? 'Continue with Email' : 'Create KlerkDesk Account'}
              </span>
              <ArrowRight className="size-4" />
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
              <span className="bg-[#111113] px-2.5 text-zinc-500">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDemoSandbox}
            disabled={isBusy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#18181B] hover:bg-[#222227] border border-white/10 text-zinc-100 py-2.5 text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
          >
            {demoPending ? (
              <Loader2 className="size-3.5 animate-spin text-emerald-400" />
            ) : (
              <Play className="size-3.5 text-emerald-400" />
            )}
            <span>
              {demoPending ? 'Provisioning Demo Sandbox...' : 'One-Click Demo Sandbox'}
            </span>
          </button>

          <div className="text-center text-xs text-zinc-400 pt-1">
            {mode === 'login' ? (
              <>
                New to KlerkDesk?{' '}
                <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 no-underline font-medium">
                  Start 14-day pilot
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href="/login" className="text-emerald-400 hover:text-emerald-300 no-underline font-medium">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </main>

      <div className="text-center text-[11px] text-zinc-500 space-x-4">
        <Link href="/privacy" className="hover:text-zinc-300 no-underline">
          Privacy Policy
        </Link>
        <span>•</span>
        <Link href="/terms" className="hover:text-zinc-300 no-underline">
          Terms of Service
        </Link>
      </div>
    </div>
  );
}
