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
