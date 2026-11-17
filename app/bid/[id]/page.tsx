import { notFound, redirect } from 'next/navigation';
import { isAuthenticatedNextjs } from '@/lib/convexAuth';
import { getBidWorkspaceAction } from '@/app/actions/bid';
import { getComplianceVaultAction } from '@/app/actions/compliance';
import { BidRoomClient } from '@/components/bid/BidRoomClient';

export const dynamic = 'force-dynamic';

interface BidPageProps {
  params: Promise<{ id: string }>;
}

export default async function BidPage({ params }: BidPageProps) {
  if (!(await isAuthenticatedNextjs())) {
    redirect('/login');
  }

  const { id } = await params;
  const [workspace, vault] = await Promise.all([
    getBidWorkspaceAction(id),
    getComplianceVaultAction(),
  ]);

  if (!workspace.tender) {
    notFound();
  }

  return (
    <BidRoomClient
      initialTender={workspace.tender}
      allTenders={vault.tenders}
      initialBoq={workspace.boq}
      initialCompliance={workspace.compliance}
      initialApprovals={workspace.approvals}
    />
  );
}
