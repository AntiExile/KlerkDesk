import { redirect } from 'next/navigation';
import { isAuthenticatedNextjs } from '@/lib/convexAuth';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { getBidWorkspaceAction } from '@/app/actions/bid';
import { getComplianceVaultAction } from '@/app/actions/compliance';

export const dynamic = 'force-dynamic';

export default async function DeskPage() {
  if (!(await isAuthenticatedNextjs())) {
    redirect('/login');
  }

  const { compliance, tenders } = await getComplianceVaultAction();
  const topId = tenders[0]?.id;
  const topBid = topId ? await getBidWorkspaceAction(topId) : null;

  return (
    <Dashboard
      initialCompliance={compliance}
      initialTenders={tenders}
      initialBoq={topBid?.boq ?? []}
      initialApprovals={topBid?.approvals ?? []}
    />
  );
}

