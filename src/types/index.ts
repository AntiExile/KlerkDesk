export interface SourceCitation {
  id?: string;
  sourceTitle?: string;
  filePath: string;
  textSnippet: string;
  fileType?: 'pdf' | 'csv' | 'txt' | 'md' | 'json' | 'docx' | 'xlsx' | string;
  characterCount?: number;
  score?: number;
}

export interface ThinkingStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
  detail?: string;
}

export interface ActionApprovalData {
  id: string;
  title: string;
  description?: string;
  command?: string;
  targetResource?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  status: 'pending' | 'approved' | 'rejected' | 'executing';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contentType: 'text' | 'code' | 'table' | 'markdown';
  sources?: SourceCitation[];
  isThinking?: boolean;
  thinkingSteps?: ThinkingStep[];
  thinkingDuration?: number;
  actionApproval?: ActionApprovalData;
  modelUsed?: string;
}

export interface Document {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  chunkCount?: number;
}

export interface Workspace {
  id: string;
  name: string;
  companyName: string;
  csdMaaaNumber: string;
  cidbGrade: string;
  regions: string[];
  createdAt: string;
}

export interface SyncFolder {
  id: string;
  name: string;
  path: string;
  lastSynced: Date;
  documentCount: number;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface AIEngineStatus {
  connected: boolean;
  modelName: string;
  endpoint: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export type ComplianceDocType =
  | 'csd'
  | 'tax_pin'
  | 'coida'
  | 'bbbee'
  | 'cipc'
  | 'certified_id';

export type ComplianceStatus = 'valid' | 'warning' | 'expired' | 'missing';

export interface ComplianceDoc {
  id: string;
  type: ComplianceDocType;
  title: string;
  shortLabel: string;
  referenceNumber: string;
  issuedAt: string;
  expiresAt: string | null;
  ageDays: number;
  maxAgeDays: number | null;
  daysUntilExpiry: number | null;
  status: ComplianceStatus;
  alertReason: string | null;
  fileName: string;
  fileSizeBytes: number;
  storageId?: string;
}

export interface ComplianceSummary {
  docs: ComplianceDoc[];
  isBidReady: boolean;
  blockingAlerts: string[];
  warningAlerts: string[];
  lastCheckedAt: string;
}

export interface TenderMatch {
  id: string;
  tenderNumber: string;
  title: string;
  municipality: string;
  region: string;
  cidbGrade: string;
  closingDate: string;
  briefingDate: string | null;
  briefingCompulsory: boolean;
  estimatedValueZar: number;
  matchScore: number;
  status: 'matched' | 'staging' | 'pending_approval' | 'submitted';
  portalUrl: string;
  complianceReady: boolean;
  complianceBlocks: string[];
  summary: string;
  sbdFormsRequired: string[];
  stagedPdfFileName?: string;
  stagedPdfBase64?: string;
  stampedSbdPageCount?: number;
  stampedSbdMethod?: string;
}

export interface BoQItem {
  id: string;
  itemCode: string;
  section: string;
  description: string;
  unit: string;
  quantity: number;
  rateZar: number;
  amountZar: number;
}

export type ApprovalActionType =
  | 'submit_etenders'
  | 'send_external_email'
  | 'whatsapp_broadcast';

export interface ApprovalShieldState {
  id: string;
  bidId: string;
  tenderNumber: string;
  actionType: ApprovalActionType;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed';
  totalBidZar: number;
  vatZar: number;
  grandTotalZar: number;
  targetResource: string;
  commandPreview: string;
  complianceVerified: boolean;
  complianceWarnings: string[];
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  boatSessionId?: string | null;
}

export interface BoatSessionInfo {
  sessionId: string;
  desktopUrl: string;
  mode: 'boat-vm' | 'local-playwright-preview';
  expiresAt: string;
  ttlSeconds: number;
  status: 'running' | 'provisioning' | 'stopped';
  stagehandSteps: string[];
}

export interface ContractorSettings {
  companyName: string;
  registrationNumber: string;
  csdMaaaNumber: string;
  taxPinNumber: string;
  bbbeeLevel: string;
  cidbGrade: string;
  municipalRegions: string[];
  whatsappNumber: string;
  openRouterSubKeyCapUsd: number;
  openRouterUsedUsd: number;
  preferredFastModel: string;
  preferredAuditModel: string;
}
