export interface SourceCitation {
  filePath: string;
  textSnippet: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contentType: 'text' | 'code' | 'table' | 'markdown';
  sources?: SourceCitation[];
  isThinking?: boolean;
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
