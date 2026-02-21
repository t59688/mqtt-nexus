export interface BrokerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  path?: string;
  ssl: boolean;
}

export interface AuthIdentity {
  id: string;
  name: string;
  username?: string;
  password?: string;
  clientId?: string;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  group?: string;
  colorTag?: string;

  brokerId?: string;
  identityId?: string;

  host: string;
  port: number;
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  protocolVersion?: 3 | 4 | 5;
  path?: string;
  ssl: boolean;

  username?: string;
  password?: string;
  clientId: string;
  clean: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Message {
  id: string;
  historyId?: number;
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
  direction: 'in' | 'out';
  timestamp: number;
}

export interface Subscription {
  topic: string;
  qos: 0 | 1 | 2;
  color: string;
  muted?: boolean;
}

export interface ConnectionState {
  profile: ConnectionProfile;
  status: ConnectionStatus;
  messages: Message[];
  subscriptions: Subscription[];
  lastError?: string;
}

export interface AiConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface PayloadTemplate {
  id: string;
  name: string;
  topic: string;
  payload: string;
}

export type TopicDirection = 'publish' | 'subscribe' | 'both';

export interface TopicCatalogItem {
  id: string;
  name: string;
  topic: string;
  direction: TopicDirection;
  qos: 0 | 1 | 2;
  retain: boolean;
  contentType?: string;
  description?: string;
  tags: string[];
  payloadTemplate?: string;
  payloadExample?: string;
  schema?: string;
}

export interface ConnectionTopicDocument {
  version: string;
  updatedAt: number;
  topics: TopicCatalogItem[];
}

export interface TopicCatalogFile {
  magic: string;
  version: string;
  topics: TopicCatalogItem[];
}

export interface PublishHistoryItem {
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
  timestamp: number;
}

export interface AppState {
  connections: Record<string, ConnectionState>;
  brokers: BrokerConfig[];
  identities: AuthIdentity[];
  activeConnectionId: string | null;
  aiConfig: AiConfig;
}

export interface NativeAppConfig {
  connections: ConnectionProfile[];
  brokers: BrokerConfig[];
  identities: AuthIdentity[];
  aiConfig?: AiConfig;
  sidebarOpen?: boolean;
  language?: string;
  theme?: 'light' | 'dark';
  activeConnectionId?: string;
  publisherTemplates?: PayloadTemplate[];
  connectionTopicDocs?: Record<string, ConnectionTopicDocument>;
  updatedAt?: number;
}

export interface AppConfigPaths {
  configDir: string;
  configFile: string;
}

export interface HistoryMessageRecord {
  id: number;
  timestamp: number;
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
  direction: 'in' | 'out';
}

export interface HistoryExportResult {
  path: string;
  count: number;
}
