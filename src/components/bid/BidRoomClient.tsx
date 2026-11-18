'use client';

import { Dashboard } from '@/components/dashboard/Dashboard';
import type {
  ApprovalShieldState,
  BoQItem,
  ComplianceSummary,
  Message,
  TenderMatch,
} from '@/types';

interface BidRoomClientProps {
  initialTender: TenderMatch;
  allTenders: TenderMatch[];
  initialBoq: BoQItem[];
  initialCompliance: ComplianceSummary;
  initialApprovals: ApprovalShieldState[];
  initialMessages?: Message[];
}

export function BidRoomClient({
  initialTender,
  allTenders,
  initialBoq,
  initialCompliance,
  initialApprovals,
  initialMessages = [],
}: BidRoomClientProps) {
  return (
    <Dashboard
      initialCompliance={initialCompliance}
      initialTenders={allTenders}
      activeTender={initialTender}
      initialBoq={initialBoq}
      initialApprovals={initialApprovals}
      initialMessages={initialMessages}
      defaultSandboxDrawerOpen={true}
    />
  );
}
