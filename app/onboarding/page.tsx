import { redirect } from 'next/navigation';
import { isAuthenticatedNextjs } from '@/lib/convexAuth';
import { getComplianceVaultAction } from '@/app/actions/compliance';
import { getContractorSettingsAction } from '@/app/actions/settings';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!(await isAuthenticatedNextjs())) {
    redirect('/login');
  }

  const [{ compliance }, settings] = await Promise.all([
    getComplianceVaultAction(),
    getContractorSettingsAction(),
  ]);

  return (
    <OnboardingWizard
      initialCompliance={compliance}
      initialSettings={settings}
    />
  );
}
