import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense>
      <AuthCard mode="login" />
    </Suspense>
  );
}
