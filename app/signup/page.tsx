import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <Suspense>
      <AuthCard mode="signup" />
    </Suspense>
  );
}
