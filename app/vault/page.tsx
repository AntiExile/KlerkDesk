import { Dashboard } from '@/components/dashboard/Dashboard';
import { getBidWorkspaceAction } from '@/app/actions/bid';
import { getComplianceVaultAction } from '@/app/actions/compliance';

export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  const { compliance, tenders } = await getComplianceVaultAction();
  const topId = tenders[0]?.id ?? 'ET-2026-WC-0842';
  const topBid = await getBidWorkspaceAction(topId);

  return (
    <Dashboard
      initialCompliance={compliance}
      initialTenders={tenders}
      initialBoq={topBid.boq}
      initialApprovals={topBid.approvals}
      defaultVaultModalOpen={true}
    />
  );
}
