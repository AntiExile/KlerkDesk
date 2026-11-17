import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { parsePlanParam } from '@/components/landing/pricing-data';

export const dynamic = 'force-dynamic';

interface SignupPageProps {
  searchParams: Promise<{ plan?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const resolved = await searchParams;
  const initialPlan = parsePlanParam(resolved?.plan);

  return (
    <Suspense>
      <AuthCard mode="signup" initialPlan={initialPlan} />
    </Suspense>
  );
}
