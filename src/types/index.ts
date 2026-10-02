export interface SourceCitation {
  filePath: string;
  textSnippet: string;
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

export interface ModelStatusInfo {
  hasModel: boolean;
  modelPath: string | null;
  modelName: string | null;
  isDefault: boolean;
  defaultModelPath: string;
}

export interface ModelDownloadProgress {
  status: 'downloading' | 'verifying' | 'completed' | 'error' | 'cancelled';
  currentFile: string;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  errorMessage?: string | null;
}

export interface IndexingProgress {
  completed: number;
  total: number;
  currentFile: string;
}

export interface IndexingDone {
  totalFiles: number;
}
