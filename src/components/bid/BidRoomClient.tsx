'use client';

import { Dashboard } from '@/components/dashboard/Dashboard';
import type {
  ApprovalShieldState,
  BoQItem,
  ComplianceSummary,
  TenderMatch,
} from '@/types';

interface BidRoomClientProps {
  initialTender: TenderMatch;
  allTenders: TenderMatch[];
  initialBoq: BoQItem[];
  initialCompliance: ComplianceSummary;
  initialApprovals: ApprovalShieldState[];
}

export function BidRoomClient({
  initialTender,
  allTenders,
  initialBoq,
  initialCompliance,
  initialApprovals,
}: BidRoomClientProps) {
  return (
    <Dashboard
      initialCompliance={initialCompliance}
      initialTenders={allTenders}
      activeTender={initialTender}
      initialBoq={initialBoq}
      initialApprovals={initialApprovals}
      defaultSandboxDrawerOpen={true}
    />
  );
}
