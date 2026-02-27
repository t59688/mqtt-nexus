import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ConnectionProfile,
  ConnectionState,
  Message,
  BrokerConfig,
  AuthIdentity,
  ConnectionStatus,
  AiConfig,
  AiPromptsConfig,
  AppConfigPaths,
  HistoryExportResult,
  HistoryMessageRecord,
  NativeAppConfig,
  PayloadTemplate,
  ConnectionTopicDocument,
  TopicCatalogFile,
  TopicCatalogItem,
  TopicDirection,
} from './types';
import {
  DEFAULT_PROFILE,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_PROMPTS,
  STORAGE_LANGUAGE_KEY,
  STORAGE_THEME_KEY,
  getRandomColor,
} from './constants';
import { invokeCommand, isTauriRuntime, listenEvent } from './services/tauriBridge';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n';
import ConnectionModal from './components/ConnectionModal';
import SettingsModal from './components/SettingsModal';
import ConnectionItem from './components/ConnectionItem';
import TopicWorkbench from './components/TopicWorkbench';
import MessageLog from './components/MessageLog';
import SimpleInputModal from './components/SimpleInputModal';
import HistoryExportModal, { HistoryExportRequest } from './components/HistoryExportModal';
import AboutModal from './components/AboutModal';

interface ImportPayload {
  magic?: string;
  connections?: ConnectionProfile[];
  brokers?: BrokerConfig[];
  identities?: AuthIdentity[];
  aiConfig?: AiConfig;
  aiPrompts?: Partial<AiPromptsConfig>;
  sidebarOpen?: boolean;
  language?: string;
  theme?: ThemeMode;
  activeConnectionId?: string;
  publisherTemplates?: PayloadTemplate[];
  connectionTopicDocs?: Record<string, ConnectionTopicDocument>;
}

interface MqttStatusEvent {
  connectionId: string;
  status: ConnectionStatus | string;
  lastError?: string;
}

interface MqttBatchEvent {
  connectionId: string;
  messages: Array<{ topic: string; payload: string; qos: number; retain: boolean; direction?: 'in' | 'out'; timestamp: number }>;
}

type ThemeMode = 'light' | 'dark';
type NoticeTone = 'info' | 'success' | 'error';
type StartupPhase = 'boot' | 'loadConfig' | 'restoreWorkspace' | 'finalize';

interface ToastNotice {
  id: string;
  message: string;
  tone: NoticeTone;
}

type ActivityTone = 'running' | 'success' | 'error';

interface ActivityNotice {
  id: string;
  title: string;
  detail: string;
  tone: ActivityTone;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: 'primary' | 'danger';
  resolver: (accepted: boolean) => void;
}

interface TopicCatalogAiDraft {
  connectionId: string;
  connectionName: string;
  sourceName: string;
  summary: string;
  topics: TopicCatalogItem[];
}

interface ZipEntryMetadata {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const MAX_MESSAGES_PER_CONNECTION = 1000;
const HISTORY_PAGE_SIZE = 200;
const MAX_LOG_VIEW_MESSAGES = 10000;
const TOPIC_DOC_VERSION = '1.0';
const APP_CONFIG_MAGIC = 'MQTT_NEXUS_APP_CONFIG_V1';
const TOPIC_CATALOG_MAGIC = 'MQTT_NEXUS_TOPIC_CATALOG_V1';
const TOPIC_AI_SOURCE_MAX_CHARS = 24000;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

const normalizeQos = (qos: number): 0 | 1 | 2 => (qos === 1 || qos === 2 ? qos : 0);
const normalizeStatus = (status: string): ConnectionStatus => (['disconnected', 'connecting', 'connected', 'error'].includes(status) ? (status as ConnectionStatus) : 'error');
const normalizeDirection = (value: unknown): TopicDirection =>
  value === 'publish' || value === 'subscribe' || value === 'both' ? value : 'publish';

const sanitizeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const sanitizeTags = (value: unknown) => (Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : []);

const sanitizeTopicItem = (value: unknown): TopicCatalogItem | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<TopicCatalogItem>;
  const topic = sanitizeText(raw.topic);
  if (!topic.trim()) {
    return null;
  }

  const qos = raw.qos === 1 || raw.qos === 2 ? raw.qos : 0;
  return {
    id: sanitizeText(raw.id) || crypto.randomUUID(),
    name: sanitizeText(raw.name) || topic,
    topic,
    direction: normalizeDirection(raw.direction),
    qos,
    retain: Boolean(raw.retain),
    contentType: sanitizeText(raw.contentType) || undefined,
    description: sanitizeText(raw.description) || undefined,
    tags: sanitizeTags(raw.tags),
    payloadTemplate: sanitizeText(raw.payloadTemplate) || undefined,
    payloadExample: sanitizeText(raw.payloadExample) || undefined,
    schema: sanitizeText(raw.schema) || undefined,
  };
};

const normalizeTopicDocument = (value: unknown): ConnectionTopicDocument | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<ConnectionTopicDocument>;
  const topics = Array.isArray(raw.topics)
    ? raw.topics
        .map((item) => sanitizeTopicItem(item))
        .filter((item): item is TopicCatalogItem => item !== null)
    : [];

  return {
    version: sanitizeText(raw.version, TOPIC_DOC_VERSION) || TOPIC_DOC_VERSION,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    topics,
  };
};

const normalizeTopicDocumentMap = (
  value: unknown,
  validConnectionIds?: Set<string>
): Record<string, ConnectionTopicDocument> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const out: Record<string, ConnectionTopicDocument> = {};
  Object.entries(value as Record<string, unknown>).forEach(([connectionId, rawDoc]) => {
    if (validConnectionIds && !validConnectionIds.has(connectionId)) {
      return;
    }
    const normalized = normalizeTopicDocument(rawDoc);
    if (normalized) {
      out[connectionId] = normalized;
    }
  });
  return out;
};

const normalizeAiPrompts = (value: unknown): AiPromptsConfig => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AI_PROMPTS };
  }
  const raw = value as Partial<AiPromptsConfig>;
  return {
    payloadSystemPrompt:
      sanitizeText(raw.payloadSystemPrompt, DEFAULT_AI_PROMPTS.payloadSystemPrompt) || DEFAULT_AI_PROMPTS.payloadSystemPrompt,
    payloadUserPromptTemplate:
      sanitizeText(raw.payloadUserPromptTemplate, DEFAULT_AI_PROMPTS.payloadUserPromptTemplate) ||
      DEFAULT_AI_PROMPTS.payloadUserPromptTemplate,
    payloadDescriptionFallback:
      sanitizeText(raw.payloadDescriptionFallback, DEFAULT_AI_PROMPTS.payloadDescriptionFallback) ||
      DEFAULT_AI_PROMPTS.payloadDescriptionFallback,
    topicCatalogSystemPrompt:
      sanitizeText(raw.topicCatalogSystemPrompt, DEFAULT_AI_PROMPTS.topicCatalogSystemPrompt) ||
      DEFAULT_AI_PROMPTS.topicCatalogSystemPrompt,
    topicCatalogUserPromptTemplate:
      sanitizeText(raw.topicCatalogUserPromptTemplate, DEFAULT_AI_PROMPTS.topicCatalogUserPromptTemplate) ||
      DEFAULT_AI_PROMPTS.topicCatalogUserPromptTemplate,
  };
};

const renderPromptTemplate = (
  template: string,
  vars: Record<string, string | number>
): string =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_all, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });

const stripMarkdownCodeFence = (value: string): string =>
  value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const extractJsonCandidate = (raw: string): string | null => {
  const chars = Array.from(raw);
  let start: number | null = null;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (start === null) {
      if (ch === '{' || ch === '[') {
        start = i;
        if (ch === '{') braceDepth = 1;
        if (ch === '[') bracketDepth = 1;
      }
      continue;
    }

    if (ch === '{') braceDepth += 1;
    if (ch === '}') braceDepth -= 1;
    if (ch === '[') bracketDepth += 1;
    if (ch === ']') bracketDepth -= 1;

    if (braceDepth === 0 && bracketDepth === 0) {
      return chars.slice(start, i + 1).join('');
    }
  }

  return null;
};

const parseTopicCatalogAiResponse = (raw: string): { summary: string; topics: TopicCatalogItem[] } => {
  const cleaned = stripMarkdownCodeFence(raw);
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const candidate = extractJsonCandidate(cleaned);
    if (!candidate) {
      throw new Error('AI output does not contain valid JSON.');
    }
    parsed = JSON.parse(candidate);
  }

  let summary = '';
  let rawTopics: unknown[] = [];

  if (Array.isArray(parsed)) {
    rawTopics = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const payload = parsed as { summary?: unknown; topics?: unknown };
    summary = sanitizeText(payload.summary);
    if (Array.isArray(payload.topics)) {
      rawTopics = payload.topics;
    }
  }

  const normalizedTopics = rawTopics
    .map((item) => sanitizeTopicItem(item))
    .filter((item): item is TopicCatalogItem => item !== null);

  const seenTopics = new Set<string>();
  const topics = normalizedTopics.filter((item) => {
    const key = item.topic.trim();
    if (!key || seenTopics.has(key)) {
      return false;
    }
    seenTopics.add(key);
    return true;
  });

  return { summary, topics };
};

const findZipEocdOffset = (view: DataView): number => {
  const lowerBound = Math.max(0, view.byteLength - 0x10000 - 22);
  for (let i = view.byteLength - 22; i >= lowerBound; i -= 1) {
    if (view.getUint32(i, true) === ZIP_EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
};

const readZipEntries = (buffer: ArrayBuffer): ZipEntryMetadata[] => {
  const view = new DataView(buffer);
  const eocdOffset = findZipEocdOffset(view);
  if (eocdOffset < 0) {
    throw new Error('Invalid DOCX zip structure.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  const entries: ZipEntryMetadata[] = [];
  let cursor = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;

  for (let i = 0; i < totalEntries && cursor + 46 <= directoryEnd; i += 1) {
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      break;
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const fileNameStart = cursor + 46;
    const fileName = decoder.decode(new Uint8Array(buffer, fileNameStart, fileNameLength));
    entries.push({
      name: fileName,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const extractZipEntryData = (buffer: ArrayBuffer, entry: ZipEntryMetadata): Uint8Array => {
  const view = new DataView(buffer);
  const localHeaderOffset = entry.localHeaderOffset;
  if (localHeaderOffset + 30 > view.byteLength) {
    throw new Error('Invalid local file header offset.');
  }
  if (view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('Invalid local file header signature.');
  }

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > view.byteLength) {
    throw new Error('Invalid compressed payload bounds.');
  }
  return new Uint8Array(buffer.slice(dataStart, dataEnd));
};

const inflateDeflateRaw = async (payload: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This runtime does not support DOCX decompression.');
  }

  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
};

const extractTextFromWordprocessingXml = (xml: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Failed to parse DOCX XML.');
  }

  const paragraphs = Array.from(doc.getElementsByTagName('w:p'))
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagName('w:t'))
        .map((node) => node.textContent || '')
        .join('')
        .trim()
    )
    .filter((line) => line.length > 0);

  return paragraphs.join('\n').trim();
};

const readDocxAsText = async (buffer: ArrayBuffer): Promise<string> => {
  const entries = readZipEntries(buffer);
  const documentXmlEntry = entries.find((entry) => entry.name === 'word/document.xml');
  if (!documentXmlEntry) {
    throw new Error('DOCX document.xml not found.');
  }

  const compressed = extractZipEntryData(buffer, documentXmlEntry);
  let xmlBytes: Uint8Array;
  if (documentXmlEntry.compressionMethod === 0) {
    xmlBytes = compressed;
  } else if (documentXmlEntry.compressionMethod === 8) {
    xmlBytes = await inflateDeflateRaw(compressed);
  } else {
    throw new Error(`Unsupported DOCX compression method: ${documentXmlEntry.compressionMethod}`);
  }

  const xml = new TextDecoder('utf-8').decode(xmlBytes);
  return extractTextFromWordprocessingXml(xml);
};

const cleanupLegacyWordText = (raw: string): string =>
  raw
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u001f]/g, ' ')
    .replace(/[^\x20-\x7E\u4E00-\u9FFF\r\n\t]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const scoreTextCandidate = (value: string): number => {
  if (!value) {
    return 0;
  }
  const readable = (value.match(/[A-Za-z0-9\u4E00-\u9FFF]/g) || []).length;
  return readable / value.length;
};

const readLegacyWordAsText = (buffer: ArrayBuffer): string => {
  const utf8 = cleanupLegacyWordText(new TextDecoder('utf-8', { fatal: false }).decode(buffer));
  const utf16 = cleanupLegacyWordText(new TextDecoder('utf-16le', { fatal: false }).decode(buffer));
  const best = scoreTextCandidate(utf16) >= scoreTextCandidate(utf8) ? utf16 : utf8;
  if (!best || scoreTextCandidate(best) < 0.2) {
    throw new Error('Unable to parse legacy .doc file reliably. Please convert to .docx.');
  }
  return best;
};

const readTopicProtocolSource = async (file: File): Promise<string> => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return file.text();
  }

  const buffer = await file.arrayBuffer();
  if (lowerName.endsWith('.docx')) {
    return readDocxAsText(buffer);
  }

  if (lowerName.endsWith('.doc')) {
    return readLegacyWordAsText(buffer);
  }

  throw new Error('Unsupported document type.');
};

const normalizeProfile = (profile: ConnectionProfile): ConnectionProfile => {
  const protocol = profile.protocol || 'wss';
  return {
    ...profile,
    protocol,
    protocolVersion: profile.protocolVersion ?? 4,
    path: profile.path ?? (protocol === 'ws' || protocol === 'wss' ? '/mqtt' : ''),
    ssl: protocol === 'mqtts' || protocol === 'wss',
  };
};

const resolveProfileProtocol = (
  profile: ConnectionProfile,
  brokers: BrokerConfig[]
): ConnectionProfile['protocol'] => {
  if (!profile.brokerId) {
    return profile.protocol;
  }
  return brokers.find((broker) => broker.id === profile.brokerId)?.protocol || profile.protocol;
};

const protocolBadgeStylesLight: Record<ConnectionProfile['protocol'], string> = {
  mqtt: 'bg-sky-50 text-sky-700 border-sky-200',
  mqtts: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ws: 'bg-amber-50 text-amber-700 border-amber-200',
  wss: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const appendMessages = (prev: Record<string, ConnectionState>, connectionId: string, newMessages: Message[]): Record<string, ConnectionState> => {
  const conn = prev[connectionId];
  if (!conn || newMessages.length === 0) return prev;
  return {
    ...prev,
    [connectionId]: { ...conn, messages: [...conn.messages, ...newMessages].slice(-MAX_MESSAGES_PER_CONNECTION) },
  };
};

const toViewMessages = (items: HistoryMessageRecord[]): Message[] =>
  items.map((item) => ({
    id: `hist-${item.id}`,
    historyId: item.id,
    topic: item.topic,
    payload: item.payload,
    qos: normalizeQos(item.qos),
    retain: item.retain,
    direction: item.direction,
    timestamp: item.timestamp,
  }));

const trimMessageWindow = (messages: Message[], keepFrom: 'start' | 'end') => {
  if (messages.length <= MAX_LOG_VIEW_MESSAGES) {
    return messages;
  }
  if (keepFrom === 'end') {
    return messages.slice(messages.length - MAX_LOG_VIEW_MESSAGES);
  }
  return messages.slice(0, MAX_LOG_VIEW_MESSAGES);
};

const listConnections = (value: Record<string, ConnectionState>): ConnectionState[] =>
  Object.values(value) as ConnectionState[];

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  try {
    const savedTheme = window.localStorage.getItem(STORAGE_THEME_KEY);
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
  } catch (error) {
    console.warn('Failed to read cached theme preference', error);
  }

  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [connections, setConnections] = useState<Record<string, ConnectionState>>({});
  const [brokers, setBrokers] = useState<BrokerConfig[]>([]);
  const [identities, setIdentities] = useState<AuthIdentity[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [aiPrompts, setAiPrompts] = useState<AiPromptsConfig>(DEFAULT_AI_PROMPTS);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'ai' | 'prompts' | 'brokers' | 'identities'>('general');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [quickAction, setQuickAction] = useState<{ type: 'rename' | 'group'; id: string } | null>(null);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | undefined>(undefined);
  const [connectionSearch, setConnectionSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [publisherTemplates, setPublisherTemplates] = useState<PayloadTemplate[]>([]);
  const [connectionTopicDocs, setConnectionTopicDocs] = useState<Record<string, ConnectionTopicDocument>>({});
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [startupPhase, setStartupPhase] = useState<StartupPhase>('boot');
  const [startupProgress, setStartupProgress] = useState(8);
  const [configPaths, setConfigPaths] = useState<AppConfigPaths | null>(null);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [activities, setActivities] = useState<ActivityNotice[]>([]);
  const [logMessages, setLogMessages] = useState<Message[]>([]);
  const [oldestCursor, setOldestCursor] = useState<{ timestamp: number; id: number } | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [lastExportPath, setLastExportPath] = useState('');
  const [lastExportFormat, setLastExportFormat] = useState<'ndjson' | 'csv'>('ndjson');
  const [isExportingHistory, setIsExportingHistory] = useState(false);
  const [topicImportTargetId, setTopicImportTargetId] = useState<string | null>(null);
  const [topicAiImportTargetId, setTopicAiImportTargetId] = useState<string | null>(null);
  const [topicAiDraft, setTopicAiDraft] = useState<TopicCatalogAiDraft | null>(null);
  const [isGeneratingTopicAiDraft, setIsGeneratingTopicAiDraft] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const topicFileInputRef = useRef<HTMLInputElement>(null);
  const topicAiFileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedConfigRef = useRef('');
  const toastTimersRef = useRef<number[]>([]);
  const activityTimersRef = useRef<number[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const sidebarHotkeyScopeRef = useRef(false);
  const sidebarCopiedConnectionIdRef = useRef<string | null>(null);
  const currentLanguage: SupportedLanguage = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const displayGroupName = (groupName: string) => (groupName === 'General' ? t('connectionModal.defaults.defaultGroup') : groupName);

  const pushToast = (message: string, tone: NoticeTone = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }].slice(-5));
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
    toastTimersRef.current.push(timer);
  };

  const startActivity = (title: string, detail: string) => {
    const id = crypto.randomUUID();
    setActivities((prev) => [...prev, { id, title, detail, tone: 'running' }].slice(-5));
    return id;
  };

  const finishActivity = (id: string, tone: Exclude<ActivityTone, 'running'>, detail: string) => {
    setActivities((prev) =>
      prev.map((item) => (item.id === id ? { ...item, tone, detail } : item))
    );
    const timer = window.setTimeout(() => {
      setActivities((prev) => prev.filter((item) => item.id !== id));
    }, tone === 'success' ? 2600 : 6000);
    activityTimersRef.current.push(timer);
  };

  const askConfirm = ({
    title,
    message,
    tone = 'primary',
    confirmLabel,
    cancelLabel,
  }: {
    title: string;
    message: string;
    tone?: 'primary' | 'danger';
    confirmLabel?: string;
    cancelLabel?: string;
  }) =>
    new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title,
        message,
        tone,
        confirmLabel: confirmLabel || t('common.confirm'),
        cancelLabel: cancelLabel || t('common.cancel'),
        resolver: resolve,
      });
    });

  const openConfigDirectory = async () => {
    if (!isTauriRuntime()) return;
    try {
      await invokeCommand<void>('open_app_config_dir');
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : t('app.openConfigDirFailed'),
        'error'
      );
    }
  };

  const copyConfigPath = async () => {
    const configFilePath = configPaths?.configFile;
    if (!configFilePath) {
      pushToast(t('app.pathUnavailable'), 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(configFilePath);
      pushToast(t('app.configPathCopied'), 'success');
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : t('app.copyConfigPathFailed'),
        'error'
      );
    }
  };

  const cloneTopicItems = (topics: TopicCatalogItem[]): TopicCatalogItem[] =>
    topics.map((item) => ({
      ...item,
      tags: [...item.tags],
    }));

  const cloneTopicDocument = (doc: ConnectionTopicDocument): ConnectionTopicDocument => ({
    version: doc.version || TOPIC_DOC_VERSION,
    updatedAt: Date.now(),
    topics: cloneTopicItems(doc.topics),
  });

  const upsertConnectionTopicDocument = (connectionId: string, doc: ConnectionTopicDocument) => {
    setConnectionTopicDocs((prev) => ({
      ...prev,
      [connectionId]: {
        version: doc.version || TOPIC_DOC_VERSION,
        updatedAt: Date.now(),
        topics: cloneTopicItems(doc.topics),
      },
    }));
  };

  const loadLatestHistory = async (connectionId: string) => {
    if (!isTauriRuntime()) {
      const fallback = connections[connectionId]?.messages || [];
      setLogMessages(fallback);
      setOldestCursor(null);
      setHasMoreOlder(false);
      return;
    }

    try {
      const rows = await invokeCommand<HistoryMessageRecord[]>('history_query_latest', {
        connectionId,
        limit: HISTORY_PAGE_SIZE,
      });
      const mapped = toViewMessages(rows);
      setLogMessages(mapped);
      const oldest = rows[0];
      setOldestCursor(oldest ? { timestamp: oldest.timestamp, id: oldest.id } : null);
      setHasMoreOlder(rows.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      console.error('Failed to load latest history', error);
      setLogMessages([]);
      setOldestCursor(null);
      setHasMoreOlder(false);
    }
  };

  const loadOlderHistory = async () => {
    if (!activeIdRef.current || !oldestCursor || isLoadingOlder) {
      return;
    }
    if (!isTauriRuntime()) {
      return;
    }

    setIsLoadingOlder(true);
    try {
      const rows = await invokeCommand<HistoryMessageRecord[]>('history_query_before', {
        connectionId: activeIdRef.current,
        beforeTs: oldestCursor.timestamp,
        beforeId: oldestCursor.id,
        limit: HISTORY_PAGE_SIZE,
      });

      if (rows.length === 0) {
        setHasMoreOlder(false);
        return;
      }

      const mapped = toViewMessages(rows);
      setLogMessages((prev) => trimMessageWindow([...mapped, ...prev], 'start'));
      const oldest = rows[0];
      if (oldest) {
        setOldestCursor({ timestamp: oldest.timestamp, id: oldest.id });
      }
      setHasMoreOlder(rows.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      console.error('Failed to load older history', error);
      pushToast(error instanceof Error ? error.message : t('messageLog.loadOlderFailed'), 'error');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const applyProfiles = (profiles: ConnectionProfile[], preferredActiveId?: string) => {
      const normalizedProfiles = profiles.map(normalizeProfile);
      if (normalizedProfiles.length === 0) {
        const defaultId = crypto.randomUUID();
        setConnections({
          [defaultId]: {
            profile: normalizeProfile({ ...DEFAULT_PROFILE, id: defaultId }),
            status: 'disconnected',
            messages: [],
            subscriptions: [],
          },
        });
        setActiveId(defaultId);
        setExpandedGroups({ General: true });
        return;
      }

      const initial: Record<string, ConnectionState> = {};
      const groups: Record<string, boolean> = { General: true };
      normalizedProfiles.forEach((p) => {
        initial[p.id] = { profile: p, status: 'disconnected', messages: [], subscriptions: [] };
        if (p.group) groups[p.group] = true;
      });

      const nextActiveId =
        preferredActiveId && initial[preferredActiveId]
          ? preferredActiveId
          : normalizedProfiles[0].id;

      setConnections(initial);
      setExpandedGroups(groups);
      setActiveId(nextActiveId);
    };

    const loadConfig = async () => {
      try {
        setStartupPhase('loadConfig');
        if (!isTauriRuntime()) {
          setStartupPhase('restoreWorkspace');
          applyProfiles([]);
          setStartupPhase('finalize');
          return;
        }

        const loaded = await invokeCommand<NativeAppConfig>('load_app_config');
        if (cancelled) return;

        const loadedProfiles = (loaded.connections || []).map(normalizeProfile);
        const loadedConnectionIds = new Set(loadedProfiles.map((profile) => profile.id));

        setBrokers((loaded.brokers || []).map((b) => ({ ...b, protocol: b.protocol || (b.ssl ? 'wss' : 'ws') })));
        setIdentities(loaded.identities || []);
        setSidebarOpen(loaded.sidebarOpen ?? true);
        setAiConfig({ ...DEFAULT_AI_CONFIG, ...(loaded.aiConfig || {}) });
        setAiPrompts(normalizeAiPrompts(loaded.aiPrompts));
        setPublisherTemplates(Array.isArray(loaded.publisherTemplates) ? loaded.publisherTemplates : []);
        setConnectionTopicDocs(
          normalizeTopicDocumentMap(loaded.connectionTopicDocs, loadedConnectionIds)
        );
        if (loaded.theme === 'dark' || loaded.theme === 'light') {
          setTheme(loaded.theme);
        }
        if (loaded.language && SUPPORTED_LANGUAGES.includes(loaded.language as SupportedLanguage)) {
          void i18n.changeLanguage(loaded.language as SupportedLanguage);
        }

        setStartupPhase('restoreWorkspace');
        applyProfiles(loadedProfiles, loaded.activeConnectionId);
        setStartupPhase('finalize');
      } catch (error) {
        console.error('Failed to load app config', error);
        setStartupPhase('restoreWorkspace');
        applyProfiles([]);
        setStartupPhase('finalize');
      } finally {
        if (!cancelled) {
          setIsConfigLoaded(true);
        }
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isConfigLoaded) {
      setStartupProgress(100);
      return;
    }

    const phaseTarget: Record<StartupPhase, number> = {
      boot: 18,
      loadConfig: 52,
      restoreWorkspace: 80,
      finalize: 94,
    };

    const target = phaseTarget[startupPhase];
    const timer = window.setInterval(() => {
      setStartupProgress((prev) => {
        if (prev >= target) {
          return prev;
        }
        const step = Math.max(1, Math.ceil((target - prev) / 7));
        return Math.min(target, prev + step);
      });
    }, 90);

    return () => window.clearInterval(timer);
  }, [isConfigLoaded, startupPhase]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void invokeCommand<AppConfigPaths>('get_app_config_paths')
      .then((paths) => setConfigPaths(paths))
      .catch((error) => {
        console.error('Failed to resolve config paths', error);
      });
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (!isConfigLoaded) {
      return;
    }
    if (!activeId) {
      setLogMessages([]);
      setOldestCursor(null);
      setHasMoreOlder(false);
      return;
    }
    setLogMessages([]);
    setOldestCursor(null);
    setHasMoreOlder(false);
    void loadLatestHistory(activeId);
  }, [activeId, isConfigLoaded]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(STORAGE_THEME_KEY, theme);
    } catch (error) {
      console.warn('Failed to cache theme preference', error);
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_LANGUAGE_KEY, currentLanguage);
    } catch (error) {
      console.warn('Failed to cache language preference', error);
    }
  }, [currentLanguage]);

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current = [];
    activityTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    activityTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (!isConfigLoaded || !isTauriRuntime()) {
      return;
    }

    const config: NativeAppConfig = {
      connections: listConnections(connections).map((c) => c.profile),
      brokers,
      identities,
      aiConfig,
      aiPrompts,
      sidebarOpen,
      language: currentLanguage,
      theme,
      activeConnectionId: activeId || undefined,
      publisherTemplates,
      connectionTopicDocs,
    };

    const serializedConfig = JSON.stringify(config);
    if (serializedConfig === lastSavedConfigRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      void invokeCommand<void>('save_app_config', { config })
        .then(() => {
          lastSavedConfigRef.current = serializedConfig;
        })
        .catch((error) => {
          console.error('Failed to save app config', error);
        });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    isConfigLoaded,
    connections,
    brokers,
    identities,
    aiConfig,
    aiPrompts,
    sidebarOpen,
    currentLanguage,
    theme,
    activeId,
    publisherTemplates,
    connectionTopicDocs,
  ]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const registerUnlistener = (unlisten: () => void) => {
      if (disposed) {
        unlisten();
        return;
      }
      unlisteners.push(unlisten);
    };

    const setup = async () => {
      const statusUnlisten = await listenEvent<MqttStatusEvent>('mqtt-status', (payload) => {
        setConnections((prev) => {
          const conn = prev[payload.connectionId];
          if (!conn) return prev;
          return { ...prev, [payload.connectionId]: { ...conn, status: normalizeStatus(payload.status), lastError: payload.lastError } };
        });
      });
      registerUnlistener(statusUnlisten);

      const batchUnlisten = await listenEvent<MqttBatchEvent>('mqtt-message-batch', (payload) => {
        const msgs: Message[] = payload.messages.map((m) => ({
          id: crypto.randomUUID(),
          topic: m.topic,
          payload: m.payload,
          qos: normalizeQos(m.qos),
          retain: m.retain,
          direction: m.direction || 'in',
          timestamp: m.timestamp || Date.now(),
        }));
        setConnections((prev) => appendMessages(prev, payload.connectionId, msgs));
        if (activeIdRef.current === payload.connectionId) {
          setLogMessages((prev) => trimMessageWindow([...prev, ...msgs], 'end'));
        }
      });
      registerUnlistener(batchUnlisten);
    };

    void setup();
    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }

      const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
      const isPasteShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
      if (!isCopyShortcut && !isPasteShortcut) {
        return;
      }

      const selectedText = window.getSelection()?.toString().trim() ?? '';
      if (isCopyShortcut && selectedText) {
        return;
      }

      if (!sidebarOpen || !sidebarHotkeyScopeRef.current) {
        return;
      }

      if (isModalOpen || isSettingsOpen || isAboutOpen || isExportModalOpen || quickAction || confirmDialog) {
        return;
      }

      if (isCopyShortcut) {
        if (activeId && connections[activeId]) {
          sidebarCopiedConnectionIdRef.current = activeId;
        }
        return;
      }

      const copiedId = sidebarCopiedConnectionIdRef.current;
      if (!copiedId) {
        return;
      }
      const sourceConnection = connections[copiedId];
      if (!sourceConnection) {
        return;
      }

      e.preventDefault();
      const sourceProfile = sourceConnection.profile;
      const newId = crypto.randomUUID();
      handleSaveProfile({
        ...sourceProfile,
        id: newId,
        name: `${sourceProfile.name} (${t('app.copySuffix')})`,
        clientId: `nexus-${Math.random().toString(16).substring(2, 10)}`,
      });
      const sourceDoc = connectionTopicDocs[sourceProfile.id];
      if (sourceDoc) {
        setConnectionTopicDocs((prev) => ({
          ...prev,
          [newId]: cloneTopicDocument(sourceDoc),
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeId,
    connections,
    t,
    connectionTopicDocs,
    sidebarOpen,
    isModalOpen,
    isSettingsOpen,
    isAboutOpen,
    isExportModalOpen,
    quickAction,
    confirmDialog,
  ]);

  // 禁用浏览器默认右键菜单
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const activeConnection = activeId ? connections[activeId] : null;

  const clearActiveHistory = async () => {
    if (!activeConnection) {
      return;
    }

    const shouldClear = await askConfirm({
      title: t('common.clear'),
      message: t('messageLog.confirmClear'),
      tone: 'danger',
      confirmLabel: t('common.clear'),
    });
    if (!shouldClear) {
      return;
    }

    const activityId = startActivity(
      t('app.activity.clearHistory'),
      t('app.activity.running')
    );

    if (isTauriRuntime()) {
      try {
        await invokeCommand<void>('history_clear', { connectionId: activeConnection.profile.id });
      } catch (error) {
        finishActivity(
          activityId,
          'error',
          error instanceof Error ? error.message : t('messageLog.clearFailed')
        );
        pushToast(error instanceof Error ? error.message : t('messageLog.clearFailed'), 'error');
        return;
      }
    }

    setConnections((prev) => ({
      ...prev,
      [activeConnection.profile.id]: {
        ...prev[activeConnection.profile.id],
        messages: [],
      },
    }));
    if (activeIdRef.current === activeConnection.profile.id) {
      setLogMessages([]);
      setOldestCursor(null);
      setHasMoreOlder(false);
    }
    pushToast(t('messageLog.clearSuccess'), 'success');
    finishActivity(activityId, 'success', t('app.activity.done'));
  };

  const browseExportPath = async (format: 'ndjson' | 'csv'): Promise<string | null> => {
    if (!activeConnection || !isTauriRuntime()) {
      return null;
    }
    try {
      const selected = await invokeCommand<string | null>('history_pick_export_path', {
        connectionId: activeConnection.profile.id,
        format,
      });
      return selected || null;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t('messageLog.pickPathFailed'), 'error');
      return null;
    }
  };

  const exportActiveHistory = async (request: HistoryExportRequest) => {
    if (!activeConnection || !isTauriRuntime()) {
      return;
    }

    setIsExportingHistory(true);
    const activityId = startActivity(
      t('app.activity.exportHistory'),
      t('app.activity.running')
    );

    try {
      const result = await invokeCommand<HistoryExportResult>('history_export', {
        connectionId: activeConnection.profile.id,
        format: request.format,
        fromTs: request.fromTs,
        toTs: request.toTs,
        outputPath: request.outputPath,
      });
      setLastExportPath(request.outputPath);
      setLastExportFormat(request.format);
      setIsExportModalOpen(false);
      pushToast(t('messageLog.exportSuccess', { count: result.count, path: result.path }), 'success');
      finishActivity(activityId, 'success', t('app.activity.done'));
    } catch (error) {
      finishActivity(
        activityId,
        'error',
        error instanceof Error ? error.message : t('messageLog.exportFailed')
      );
      pushToast(error instanceof Error ? error.message : t('messageLog.exportFailed'), 'error');
    } finally {
      setIsExportingHistory(false);
    }
  };

  const exportConfig = async () => {
    const data: ImportPayload = {
      magic: APP_CONFIG_MAGIC,
      connections: listConnections(connections).map((c) => c.profile),
      brokers,
      identities,
      aiConfig,
      aiPrompts,
      sidebarOpen,
      language: currentLanguage,
      theme,
      activeConnectionId: activeId || undefined,
      publisherTemplates,
      connectionTopicDocs,
    };
    const serialized = JSON.stringify(data, null, 2);

    if (isTauriRuntime()) {
      try {
        const exportedPath = await invokeCommand<string | null>('app_config_export', {
          content: serialized,
        });
        if (exportedPath) {
          pushToast(t('app.exportConfigSuccess', { path: exportedPath }), 'success');
        }
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : t('app.exportConfigFailed'),
          'error'
        );
      }
      return;
    }

    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mqtt-nexus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast(t('app.exportConfigStarted'), 'success');
  };

  const exportConnectionTopicCatalog = async (connectionId: string) => {
    const currentDoc = connectionTopicDocs[connectionId];
    const payload: TopicCatalogFile = {
      magic: TOPIC_CATALOG_MAGIC,
      version: currentDoc?.version || TOPIC_DOC_VERSION,
      topics: cloneTopicItems(currentDoc?.topics || []),
    };
    const serialized = JSON.stringify(payload, null, 2);

    if (isTauriRuntime()) {
      try {
        const exportedPath = await invokeCommand<string | null>('topic_catalog_export', {
          connectionId,
          content: serialized,
        });
        if (exportedPath) {
          pushToast(t('topicWorkbench.exportSuccess', { path: exportedPath }), 'success');
        }
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : t('topicWorkbench.exportFailed'),
          'error'
        );
      }
      return;
    }

    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const connectionName = connections[connectionId]?.profile.name || connectionId;
    const safeName = connectionName.replace(/[^\w\-]+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-topic-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast(t('topicWorkbench.exportStarted'), 'success');
  };

  const triggerTopicCatalogImport = (connectionId: string) => {
    if (!connections[connectionId]) {
      pushToast(t('topicWorkbench.connectionMissing'), 'error');
      return;
    }
    setTopicImportTargetId(connectionId);
    topicFileInputRef.current?.click();
  };

  const resetTopicAiImportSelection = () => {
    if (topicAiFileInputRef.current) {
      topicAiFileInputRef.current.value = '';
    }
    setTopicAiImportTargetId(null);
  };

  const triggerTopicCatalogAiImport = (connectionId: string) => {
    if (!connections[connectionId]) {
      pushToast(t('topicWorkbench.connectionMissing'), 'error');
      return;
    }
    if (isGeneratingTopicAiDraft) {
      return;
    }
    setTopicAiImportTargetId(connectionId);
    topicAiFileInputRef.current?.click();
  };

  const buildTopicCatalogAiPrompt = (sourceName: string, sourceText: string) => {
    const responseLanguage = currentLanguage === 'zh' ? 'Chinese' : 'English';
    return renderPromptTemplate(aiPrompts.topicCatalogUserPromptTemplate, {
      responseLanguage,
      sourceName,
      sourceText,
    });
  };

  const mapTopicAiImportError = (error: unknown): string => {
    const detail = error instanceof Error ? error.message : String(error);
    if (!detail) {
      return t('topicWorkbench.aiImportFailed');
    }
    if (detail.includes('Unsupported document type')) {
      return t('topicWorkbench.aiImportUnsupportedType');
    }
    if (detail.includes('AI user prompt is missing')) {
      return t('topicWorkbench.aiPromptMissing');
    }
    if (detail.includes('legacy .doc')) {
      return t('topicWorkbench.aiImportLegacyDocHint');
    }
    if (detail.includes('DOCX')) {
      return t('topicWorkbench.aiImportParseFailed');
    }
    return detail;
  };

  const importConnectionTopicCatalogByAi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetConnectionId = topicAiImportTargetId;
    const file = e.target.files?.[0];
    if (!file || !targetConnectionId) {
      resetTopicAiImportSelection();
      return;
    }

    const targetConnection = connections[targetConnectionId];
    if (!targetConnection) {
      pushToast(t('topicWorkbench.connectionMissing'), 'error');
      resetTopicAiImportSelection();
      return;
    }

    void (async () => {
      setIsGeneratingTopicAiDraft(true);
      const activityId = startActivity(
        t('topicWorkbench.aiImportActivity'),
        `${targetConnection.profile.name} / ${file.name}`
      );

      try {
        const sourceText = (await readTopicProtocolSource(file)).trim();
        if (!sourceText) {
          throw new Error(t('topicWorkbench.aiImportSourceEmpty'));
        }

        const truncatedText = sourceText.slice(0, TOPIC_AI_SOURCE_MAX_CHARS);
        if (truncatedText.length < sourceText.length) {
          pushToast(
            t('topicWorkbench.aiImportTruncated', { max: TOPIC_AI_SOURCE_MAX_CHARS }),
            'info'
          );
        }

        const options: AiConfig = {
          baseUrl: aiConfig.baseUrl?.trim() || '',
          apiKey: aiConfig.apiKey?.trim() || '',
          model: aiConfig.model?.trim() || '',
        };

        const catalogPrompt = buildTopicCatalogAiPrompt(file.name, truncatedText);
        const aiResponse = await invokeCommand<string>('ai_generate_payload', {
          topic: 'mqtt/topic-catalog-from-protocol',
          description: catalogPrompt,
          options,
          promptSystem: aiPrompts.topicCatalogSystemPrompt,
          promptUser: catalogPrompt,
        });
        const parsed = parseTopicCatalogAiResponse(aiResponse);
        if (parsed.topics.length === 0) {
          throw new Error(t('topicWorkbench.aiImportNoTopics'));
        }

        setTopicAiDraft({
          connectionId: targetConnectionId,
          connectionName: targetConnection.profile.name,
          sourceName: file.name,
          summary: parsed.summary,
          topics: parsed.topics,
        });

        finishActivity(
          activityId,
          'success',
          t('topicWorkbench.aiImportReady', { count: parsed.topics.length })
        );
      } catch (error) {
        const detail = mapTopicAiImportError(error);
        finishActivity(activityId, 'error', detail);
        pushToast(detail, 'error');
      } finally {
        setIsGeneratingTopicAiDraft(false);
        resetTopicAiImportSelection();
      }
    })();
  };

  const applyAiTopicCatalogDraft = () => {
    if (!topicAiDraft) {
      return;
    }

    const targetConnection = connections[topicAiDraft.connectionId];
    if (!targetConnection) {
      pushToast(t('topicWorkbench.connectionMissing'), 'error');
      setTopicAiDraft(null);
      return;
    }

    upsertConnectionTopicDocument(topicAiDraft.connectionId, {
      version: TOPIC_DOC_VERSION,
      updatedAt: Date.now(),
      topics: topicAiDraft.topics,
    });

    pushToast(
      t('topicWorkbench.importSuccess', {
        count: topicAiDraft.topics.length,
        name: targetConnection.profile.name,
      }),
      'success'
    );
    setTopicAiDraft(null);
  };

  const importConnectionTopicCatalog = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetConnectionId = topicImportTargetId;
    const file = e.target.files?.[0];
    if (!file || !targetConnectionId) {
      if (topicFileInputRef.current) topicFileInputRef.current.value = '';
      setTopicImportTargetId(null);
      return;
    }

    const targetConnection = connections[targetConnectionId];
    if (!targetConnection) {
      pushToast(t('topicWorkbench.connectionMissing'), 'error');
      if (topicFileInputRef.current) topicFileInputRef.current.value = '';
      setTopicImportTargetId(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;

        const parsed = JSON.parse(result) as TopicCatalogFile;
        if (parsed.magic !== TOPIC_CATALOG_MAGIC) {
          pushToast(t('topicWorkbench.invalidMagic'), 'error');
          return;
        }
        const topics = Array.isArray(parsed.topics)
          ? parsed.topics
              .map((item) => sanitizeTopicItem(item))
              .filter((item): item is TopicCatalogItem => item !== null)
          : [];

        if (!Array.isArray(parsed.topics)) {
          pushToast(t('topicWorkbench.invalidImport'), 'error');
          return;
        }

        const shouldContinue = await askConfirm({
          title: t('common.confirm'),
          message: t('topicWorkbench.overwriteConfirm', { name: targetConnection.profile.name }),
          tone: 'danger',
          confirmLabel: t('common.import'),
        });
        if (!shouldContinue) {
          return;
        }

        upsertConnectionTopicDocument(targetConnectionId, {
          version: sanitizeText(parsed.version, TOPIC_DOC_VERSION) || TOPIC_DOC_VERSION,
          updatedAt: Date.now(),
          topics,
        });

        pushToast(
          t('topicWorkbench.importSuccess', { count: topics.length, name: targetConnection.profile.name }),
          'success'
        );
      } catch (error) {
        console.error(error);
        pushToast(t('topicWorkbench.invalidImport'), 'error');
      } finally {
        if (topicFileInputRef.current) topicFileInputRef.current.value = '';
        setTopicImportTargetId(null);
      }
    };

    reader.readAsText(file);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        const data = JSON.parse(result) as ImportPayload;
        if (data.magic !== APP_CONFIG_MAGIC) {
          pushToast(t('app.importConfig.invalidMagic'), 'error');
          return;
        }

        if (
          !data.connections &&
          !data.brokers &&
          !data.identities &&
          !data.aiConfig &&
          !data.aiPrompts &&
          data.sidebarOpen === undefined &&
          !data.language &&
          !data.theme &&
          !data.publisherTemplates &&
          !data.connectionTopicDocs
        ) {
          pushToast(t('app.importConfig.invalid'), 'error');
          return;
        }

        const shouldContinue = await askConfirm({
          title: t('common.confirm'),
          message: t('app.importConfig.overwriteConfirm'),
          tone: 'danger',
          confirmLabel: t('common.import'),
        });
        if (!shouldContinue) return;

        Object.keys(connections).forEach((connectionId) => {
          void invokeCommand<void>('mqtt_disconnect', { connectionId }).catch(() => {});
        });

        if (data.brokers && Array.isArray(data.brokers)) setBrokers(data.brokers);
        if (data.identities && Array.isArray(data.identities)) setIdentities(data.identities);
        if (data.aiConfig && typeof data.aiConfig === 'object') setAiConfig({ ...DEFAULT_AI_CONFIG, ...data.aiConfig });
        if (data.aiPrompts && typeof data.aiPrompts === 'object') {
          setAiPrompts(normalizeAiPrompts(data.aiPrompts));
        }
        if (typeof data.sidebarOpen === 'boolean') setSidebarOpen(data.sidebarOpen);
        if (data.theme === 'dark' || data.theme === 'light') setTheme(data.theme);
        if (data.language && SUPPORTED_LANGUAGES.includes(data.language as SupportedLanguage)) {
          void i18n.changeLanguage(data.language as SupportedLanguage);
        }
        if (Array.isArray(data.publisherTemplates)) setPublisherTemplates(data.publisherTemplates);
        if (data.connectionTopicDocs && !(data.connections && Array.isArray(data.connections))) {
          setConnectionTopicDocs(
            normalizeTopicDocumentMap(data.connectionTopicDocs, new Set(Object.keys(connections)))
          );
        }

        if (data.connections && Array.isArray(data.connections)) {
          const newConns: Record<string, ConnectionState> = {};
          const newGroups: Record<string, boolean> = { General: true };

          data.connections.map(normalizeProfile).forEach((p) => {
            newConns[p.id] = { profile: p, status: 'disconnected', messages: [], subscriptions: [] };
            if (p.group) newGroups[p.group] = true;
          });

          setConnections(newConns);
          setExpandedGroups((prev) => ({ ...prev, ...newGroups }));
          if (!data.connectionTopicDocs) {
            setConnectionTopicDocs({});
          } else {
            setConnectionTopicDocs(
              normalizeTopicDocumentMap(data.connectionTopicDocs, new Set(Object.keys(newConns)))
            );
          }
          if (data.activeConnectionId && newConns[data.activeConnectionId]) {
            setActiveId(data.activeConnectionId);
          } else {
            setActiveId(Object.keys(newConns)[0] || null);
          }
        }

        pushToast(t('app.importConfig.success'), 'success');
      } catch (err) {
        console.error(err);
        pushToast(t('app.importConfig.parseFailed'), 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSaveProfile = (profile: ConnectionProfile) => {
    const normalized = normalizeProfile(profile);
    setConnections((prev) => {
      const next = { ...prev };
      if (next[normalized.id]) next[normalized.id].profile = normalized;
      else next[normalized.id] = { profile: normalized, status: 'disconnected', messages: [], subscriptions: [] };
      return next;
    });

    if (normalized.group) setExpandedGroups((prev) => ({ ...prev, [normalized.group!]: true }));
    if (!activeId) setActiveId(normalized.id);
    setIsModalOpen(false);
    setEditingProfile(undefined);
  };

  const deleteConnection = async (e: React.MouseEvent | null, id: string) => {
    if (e) e.stopPropagation();
    const shouldDelete = await askConfirm({
      title: t('app.context.delete'),
      message: t('app.confirmDeleteConnection'),
      tone: 'danger',
      confirmLabel: t('common.delete'),
    });
    if (!shouldDelete) return;

    const activityId = startActivity(
      t('app.activity.deleteConnection'),
      t('app.activity.running')
    );

    try {
      await invokeCommand<void>('mqtt_disconnect', { connectionId: id });
    } catch {
      // ignore disconnect errors before deletion
    }

    if (isTauriRuntime()) {
      try {
        await invokeCommand<void>('history_delete_connection', { connectionId: id });
      } catch (error) {
        finishActivity(
          activityId,
          'error',
          error instanceof Error ? error.message : t('app.deleteHistoryFailed')
        );
        pushToast(error instanceof Error ? error.message : t('app.deleteHistoryFailed'), 'error');
        return;
      }
    }

    setConnections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setConnectionTopicDocs((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeId === id) {
      setActiveId(null);
      setLogMessages([]);
      setOldestCursor(null);
      setHasMoreOlder(false);
    }
    finishActivity(activityId, 'success', t('app.activity.done'));
  };

  const cloneConnection = (e: React.MouseEvent | null, profile: ConnectionProfile) => {
    if (e) e.stopPropagation();
    const newId = crypto.randomUUID();
    handleSaveProfile({
      ...profile,
      id: newId,
      name: `${profile.name} (${t('app.copySuffix')})`,
      clientId: `nexus-${Math.random().toString(16).substring(2, 10)}`,
    });
    const sourceDoc = connectionTopicDocs[profile.id];
    if (sourceDoc) {
      setConnectionTopicDocs((prev) => ({
        ...prev,
        [newId]: cloneTopicDocument(sourceDoc),
      }));
    }
  };

  const openSettings = (tab: 'general' | 'ai' | 'prompts' | 'brokers' | 'identities' = 'general') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const connect = async (id: string) => {
    const conn = connections[id];
    if (!conn) return;

    setConnections((prev) => ({ ...prev, [id]: { ...prev[id], status: 'connecting', lastError: undefined } }));

    try {
      await invokeCommand<void>('mqtt_connect', { profile: conn.profile, brokers, identities });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setConnections((prev) => ({ ...prev, [id]: { ...prev[id], status: 'error', lastError: message } }));
    }
  };

  const disconnect = async (id: string) => {
    try {
      await invokeCommand<void>('mqtt_disconnect', { connectionId: id });
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
    setConnections((prev) => ({ ...prev, [id]: { ...prev[id], status: 'disconnected', subscriptions: [] } }));
  };

  const subscribe = async (id: string, topic: string, qos: 0 | 1 | 2, color?: string) => {
    const conn = connections[id];
    if (!conn || conn.status !== 'connected') return;

    try {
      await invokeCommand<void>('mqtt_subscribe', { connectionId: id, topic, qos });
      setConnections((prev) => {
        const current = prev[id];
        if (!current || current.subscriptions.some((sub) => sub.topic === topic)) return prev;
        return {
          ...prev,
          [id]: {
            ...current,
            subscriptions: [...current.subscriptions, { topic, qos, color: color || getRandomColor(), muted: false }],
          },
        };
      });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const unsubscribe = async (id: string, topic: string) => {
    const conn = connections[id];
    if (!conn || conn.status !== 'connected') return;

    try {
      await invokeCommand<void>('mqtt_unsubscribe', { connectionId: id, topic });
      setConnections((prev) => ({ ...prev, [id]: { ...prev[id], subscriptions: prev[id].subscriptions.filter((s) => s.topic !== topic) } }));
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const toggleMute = (id: string, topic: string) => {
    setConnections((prev) => {
      const conn = prev[id];
      if (!conn) return prev;
      return { ...prev, [id]: { ...conn, subscriptions: conn.subscriptions.map((s) => (s.topic === topic ? { ...s, muted: !s.muted } : s)) } };
    });
  };

  const publish = async (id: string, topic: string, payload: string, qos: 0 | 1 | 2, retain: boolean) => {
    const conn = connections[id];
    if (!conn || conn.status !== 'connected') return;

    try {
      await invokeCommand<void>('mqtt_publish', { connectionId: id, topic, payload, qos, retain });
      const outgoing: Message = {
        id: crypto.randomUUID(),
        topic,
        payload,
        qos,
        retain,
        direction: 'out',
        timestamp: Date.now(),
      };
      setConnections((prev) =>
        appendMessages(prev, id, [
          outgoing,
        ])
      );
      if (activeIdRef.current === id) {
        setLogMessages((prev) => trimMessageWindow([...prev, outgoing], 'end'));
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const generatePayload = async (topic: string, description: string) => {
    const options: AiConfig = {
      baseUrl: aiConfig.baseUrl?.trim() || '',
      apiKey: aiConfig.apiKey?.trim() || '',
      model: aiConfig.model?.trim() || '',
    };
    const normalizedDescription =
      description.trim() || aiPrompts.payloadDescriptionFallback.trim();
    const userPrompt = renderPromptTemplate(aiPrompts.payloadUserPromptTemplate, {
      topic,
      description: normalizedDescription,
    });

    try {
      return await invokeCommand<string>('ai_generate_payload', {
        topic,
        description: userPrompt,
        options,
        promptSystem: aiPrompts.payloadSystemPrompt,
        promptUser: userPrompt,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes('AI user prompt is missing')) {
        throw new Error(t('topicWorkbench.aiPromptMissing'));
      }
      throw new Error(detail || t('publisher.aiFailed'));
    }
  };

  const confirmDeleteTopic = async (topicName: string) =>
    askConfirm({
      title: t('common.delete'),
      message: t('topicWorkbench.confirmDeleteTopic', { name: topicName }),
      tone: 'danger',
      confirmLabel: t('common.delete'),
    });

  const getGroupedConnections = () => {
    const groups: Record<string, ConnectionState[]> = {};
    listConnections(connections).forEach((c) => {
      if (
        connectionSearch &&
        !c.profile.name.toLowerCase().includes(connectionSearch.toLowerCase()) &&
        !c.profile.host.includes(connectionSearch)
      )
        return;
      const g = c.profile.group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    });
    return groups;
  };

  if (!isConfigLoaded) {
    const shownProgress = Math.max(6, Math.min(99, Math.round(startupProgress)));
    return (
      <div className="startup-screen startup-screen--app" role="status" aria-live="polite" aria-label="Loading">
        <div className="startup-card">
          <div className="startup-head" aria-hidden="true">
            <div className="startup-mark">
              <img src="/app-icon.png" alt="" />
            </div>
            <div className="startup-name">NexusMQTT</div>
          </div>
          <div className="startup-progress-track" aria-hidden="true">
            <div className="startup-progress-fill startup-progress-fill--determinate" style={{ width: `${shownProgress}%` }}></div>
          </div>
        </div>
      </div>
    );
  }

  const groupedConnections = getGroupedConnections();
  const sortedGroupNames = Object.keys(groupedConnections).sort();
  const allGroupNames = Array.from(new Set(listConnections(connections).map((c) => c.profile.group || 'General')));
  const welcomeDescriptionLines = t('app.welcomeDescription').split('\n');
  const activeTopicDoc = activeConnection ? connectionTopicDocs[activeConnection.profile.id] : undefined;
  const activeProtocol = activeConnection
    ? resolveProfileProtocol(activeConnection.profile, brokers)
    : 'mqtt';

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900" onClick={() => setContextMenu(null)}>
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[180px] animate-in fade-in zoom-in duration-100 origin-top-left"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{connections[contextMenu.id]?.profile.name}</span>
          </div>

          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 hover:text-indigo-600 flex items-center gap-2"
            onClick={() => {
              setQuickAction({ type: 'rename', id: contextMenu.id });
              setContextMenu(null);
            }}
          >
            <i className="fas fa-i-cursor w-4 text-center"></i> {t('app.context.rename')}
          </button>

          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 hover:text-indigo-600 flex items-center gap-2"
            onClick={() => {
              setQuickAction({ type: 'group', id: contextMenu.id });
              setContextMenu(null);
            }}
          >
            <i className="fas fa-folder w-4 text-center"></i> {t('app.context.moveToGroup')}
          </button>

          <div className="border-t border-slate-100 my-1"></div>

          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 hover:text-indigo-600 flex items-center gap-2"
            onClick={() => {
              cloneConnection(null, connections[contextMenu.id].profile);
              setContextMenu(null);
            }}
          >
            <i className="fas fa-clone w-4 text-center"></i> {t('app.context.duplicate')}
          </button>

          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 hover:text-indigo-600 flex items-center gap-2"
            onClick={() => {
              setEditingProfile(connections[contextMenu.id].profile);
              setIsModalOpen(true);
              setContextMenu(null);
            }}
          >
            <i className="fas fa-cog w-4 text-center"></i> {t('app.context.editConfiguration')}
          </button>

          <div className="border-t border-slate-100 my-1"></div>

          <button
            className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"
            onClick={() => {
              void deleteConnection(null, contextMenu.id);
              setContextMenu(null);
            }}
          >
            <i className="fas fa-trash w-4 text-center"></i> {t('app.context.delete')}
          </button>
        </div>
      )}

      <div
        className={`${sidebarOpen ? 'w-64' : 'w-0 opacity-0'} bg-slate-900 flex flex-col border-r border-slate-800 shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap`}
        onMouseDownCapture={() => {
          sidebarHotkeyScopeRef.current = true;
        }}
        onFocusCapture={() => {
          sidebarHotkeyScopeRef.current = true;
        }}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/30">
          <div className="flex items-center gap-3">
            <img src="/app-icon.png" alt="" className="w-8 h-8 rounded object-cover shadow-lg shadow-indigo-500/20" />
            <h1 className="text-lg font-bold text-white tracking-tight">NexusMQTT</h1>
          </div>
          <button onClick={() => {
            sidebarHotkeyScopeRef.current = false;
            setSidebarOpen(false);
          }} className="text-slate-500 hover:text-slate-200 transition-colors">
            <i className="fas fa-angle-left text-lg"></i>
          </button>
        </div>

        <div className="p-2.5 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
            <input type="text" placeholder={t('app.searchConnections')} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" value={connectionSearch} onChange={e => setConnectionSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-1 custom-scrollbar">
          {sortedGroupNames.map(groupName => (
            <div key={groupName} className="mb-2">
              <div onClick={() => setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))} className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors select-none group">
                <i className={`fas fa-chevron-right text-[10px] transition-transform duration-200 ${expandedGroups[groupName] ? 'rotate-90' : ''}`}></i>
                <span className="text-xs font-bold uppercase tracking-wider flex-1">{displayGroupName(groupName)}</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-500">{groupedConnections[groupName].length}</span>
              </div>
              {expandedGroups[groupName] && (
                <div className="space-y-0.5 mt-1">
                  {groupedConnections[groupName].map(c => (
                    <ConnectionItem
                      key={c.profile.id}
                      profile={c.profile}
                      status={c.status}
                      protocol={resolveProfileProtocol(c.profile, brokers)}
                      isActive={activeId === c.profile.id}
                      onSelect={() => {
                        sidebarHotkeyScopeRef.current = true;
                        setActiveId(c.profile.id);
                      }}
                      onDelete={(e) => { void deleteConnection(e, c.profile.id); }}
                      onEdit={(e) => { e.stopPropagation(); setEditingProfile(c.profile); setIsModalOpen(true); }}
                      onClone={(e) => cloneConnection(e, c.profile)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: c.profile.id }); }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-slate-800 bg-slate-950/30 space-y-2">
          <button onClick={() => { setEditingProfile(undefined); setIsModalOpen(true); }} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg font-semibold text-sm">
            <i className="fas fa-plus"></i> {t('app.addConnection')}
          </button>

          <button
            onClick={() => setIsAboutOpen(true)}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg flex items-center justify-center gap-2 transition-all font-semibold text-sm border border-slate-700"
          >
            <i className="fas fa-circle-info"></i> {t('app.about')}
          </button>

          <button onClick={() => openSettings('general')} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg flex items-center justify-center gap-2 transition-all font-semibold text-sm border border-slate-700">
            <i className="fas fa-cog"></i> {t('app.settings')}
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex flex-col overflow-hidden relative bg-slate-50"
        onMouseDownCapture={() => {
          sidebarHotkeyScopeRef.current = false;
        }}
        onFocusCapture={() => {
          sidebarHotkeyScopeRef.current = false;
        }}
      >
        {activeConnection ? (
          <>
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-5 shadow-sm z-10 flex-shrink-0">
              <div className="flex items-center gap-4 overflow-hidden">
                {!sidebarOpen && (
                  <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-indigo-600 transition-colors mr-2">
                    <i className="fas fa-bars text-lg"></i>
                  </button>
                )}
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate">
                    {activeConnection.profile.name}
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wide border ${protocolBadgeStylesLight[activeProtocol]}`}>
                      {activeProtocol}
                    </span>
                    {activeConnection.profile.brokerId && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 rounded uppercase tracking-wide border border-indigo-100">{t('app.linked')}</span>}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <i className={`fas fa-circle text-[8px] ${activeConnection.status === 'connected' ? 'text-emerald-500' : 'text-slate-300'}`}></i>
                    <span>
                      {activeConnection.profile.brokerId
                        ? (brokers.find(b => b.id === activeConnection.profile.brokerId)?.host || activeConnection.profile.host)
                        : activeConnection.profile.host}
                    </span>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border flex items-center gap-2 ${activeConnection.status === 'connected' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : activeConnection.status === 'error' ? 'bg-red-50 text-red-600 border-red-200' : activeConnection.status === 'connecting' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  <span className={`w-2 h-2 rounded-full ${activeConnection.status === 'connected' ? 'bg-emerald-500' : activeConnection.status === 'error' ? 'bg-red-500' : activeConnection.status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-400'}`}></span>
                  {t(`status.${activeConnection.status}`)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { if (activeConnection.status === 'connected') { void disconnect(activeConnection.profile.id); } else { void connect(activeConnection.profile.id); } }} className={`px-6 py-2 rounded-lg font-bold text-white transition-all shadow-md active:scale-95 min-w-[120px] text-sm flex items-center justify-center gap-2 ${activeConnection.status === 'connected' ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200'}`}>
                  {activeConnection.status === 'connected' ? <><i className="fas fa-plug"></i> {t('common.disconnect')}</> : <><i className="fas fa-power-off"></i> {t('common.connect')}</>}
                </button>
              </div>
            </header>

            {activeConnection.lastError && (
              <div className="bg-red-50 text-red-700 px-4 lg:px-5 py-2 text-xs border-b border-red-100 flex items-center gap-2 animate-in slide-in-from-top-2">
                <i className="fas fa-exclamation-circle"></i> <span className="font-semibold">{t('app.connectionError')}</span> {activeConnection.lastError}
              </div>
            )}

            <main className="flex-1 p-2 lg:p-2.5 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full">
                <div className="lg:col-span-2 h-full min-h-[500px]">
                  <TopicWorkbench
                    connectionId={activeConnection.profile.id}
                    isConnected={activeConnection.status === 'connected'}
                    subscriptions={activeConnection.subscriptions}
                    document={activeTopicDoc}
                    onDocumentChange={upsertConnectionTopicDocument}
                    onPublishForConnection={(targetConnectionId, topic, payload, qos, retain) => {
                      void publish(targetConnectionId, topic, payload, qos, retain);
                    }}
                    isConnectionConnected={(targetConnectionId) =>
                      connections[targetConnectionId]?.status === 'connected'
                    }
                    onSubscribe={(topic, qos) => {
                      void subscribe(activeConnection.profile.id, topic, qos);
                    }}
                    onUnsubscribe={(topic) => {
                      void unsubscribe(activeConnection.profile.id, topic);
                    }}
                    onToggleMute={(topic) => toggleMute(activeConnection.profile.id, topic)}
                    onGeneratePayload={generatePayload}
                    onNotify={(message, tone: NoticeTone = 'info') => pushToast(message, tone)}
                    onImport={() => triggerTopicCatalogImport(activeConnection.profile.id)}
                    onAiImport={() => triggerTopicCatalogAiImport(activeConnection.profile.id)}
                    onExport={() => exportConnectionTopicCatalog(activeConnection.profile.id)}
                    isAiImporting={isGeneratingTopicAiDraft}
                    onConfirmDeleteTopic={confirmDeleteTopic}
                  />
                </div>
                <div className="lg:col-span-3 h-full min-h-[500px]">
                  <MessageLog
                    messages={logMessages}
                    subscriptions={activeConnection.subscriptions}
                    hasMoreOlder={hasMoreOlder}
                    isLoadingOlder={isLoadingOlder}
                    onLoadOlder={() => loadOlderHistory()}
                    onClear={() => { void clearActiveHistory(); }}
                    onExport={() => setIsExportModalOpen(true)}
                  />
                </div>
              </div>
            </main>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 relative">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="absolute top-4 left-6 text-slate-400 hover:text-indigo-600 transition-colors p-2">
                <i className="fas fa-bars text-xl"></i>
              </button>
            )}
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100"><i className="fas fa-network-wired text-4xl text-indigo-200"></i></div>
            <h2 className="text-2xl font-bold text-slate-700 mb-2">{t('app.welcomeTitle')}</h2>
            <p className="max-w-md text-center text-slate-500">
              {welcomeDescriptionLines.map((line, index) => (
                <React.Fragment key={`${line}-${index}`}>
                  {line}
                  {index < welcomeDescriptionLines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
            <div className="text-sm text-slate-400 mt-4 bg-slate-100 px-4 py-2 rounded-lg font-mono">
              <i className="fas fa-keyboard mr-2"></i> {t('app.tip')}
            </div>
            <button onClick={() => { setEditingProfile(undefined); setIsModalOpen(true); }} className="mt-8 px-8 py-3 bg-white border border-indigo-200 text-indigo-600 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5 rounded-xl font-bold transition-all flex items-center gap-2"><i className="fas fa-plus text-indigo-500"></i> {t('app.createFirstConnection')}</button>
          </div>
        )}

        <ConnectionModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingProfile(undefined); }}
          onSave={handleSaveProfile}
          initialProfile={editingProfile}
          existingGroups={allGroupNames}
          brokers={brokers}
          identities={identities}
          onOpenSettings={(tab) => { setIsModalOpen(false); openSettings(tab); }}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          initialTab={settingsTab}
          brokers={brokers}
          identities={identities}
          language={currentLanguage}
          theme={theme}
          aiConfig={aiConfig}
          aiPrompts={aiPrompts}
          configFilePath={configPaths?.configFile}
          onLanguageChange={(language) => {
            if (SUPPORTED_LANGUAGES.includes(language)) {
              void i18n.changeLanguage(language);
            }
          }}
          onThemeChange={(nextTheme) => setTheme(nextTheme)}
          onOpenConfigDir={() => { void openConfigDirectory(); }}
          onCopyConfigPath={() => { void copyConfigPath(); }}
          onImportConfig={() => fileInputRef.current?.click()}
          onExportConfig={() => {
            void exportConfig();
          }}
          onAiConfigChange={(nextAiConfig) => setAiConfig({ ...DEFAULT_AI_CONFIG, ...nextAiConfig })}
          onAiPromptsChange={(nextAiPrompts) => setAiPrompts(normalizeAiPrompts(nextAiPrompts))}
          onSaveBroker={(b) => setBrokers(prev => { const exists = prev.find(x => x.id === b.id); if (exists) return prev.map(x => x.id === b.id ? b : x); return [...prev, b]; })}
          onDeleteBroker={(id) => setBrokers(prev => prev.filter(b => b.id !== id))}
          onSaveIdentity={(i) => setIdentities(prev => { const exists = prev.find(x => x.id === i.id); if (exists) return prev.map(x => x.id === i.id ? i : x); return [...prev, i]; })}
          onDeleteIdentity={(id) => setIdentities(prev => prev.filter(i => i.id !== id))}
        />

        <AboutModal
          isOpen={isAboutOpen}
          onClose={() => setIsAboutOpen(false)}
        />

        <HistoryExportModal
          isOpen={isExportModalOpen}
          isSubmitting={isExportingHistory}
          initialFormat={lastExportFormat}
          initialPath={lastExportPath}
          onClose={() => {
            if (!isExportingHistory) {
              setIsExportModalOpen(false);
            }
          }}
          onBrowsePath={browseExportPath}
          onExport={exportActiveHistory}
        />

        <input type="file" ref={fileInputRef} onChange={importConfig} className="hidden" accept=".json" />
        <input
          type="file"
          ref={topicFileInputRef}
          onChange={importConnectionTopicCatalog}
          className="hidden"
          accept=".json"
        />
        <input
          type="file"
          ref={topicAiFileInputRef}
          onChange={importConnectionTopicCatalogByAi}
          className="hidden"
          accept=".txt,.md,.doc,.docx,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />

        {topicAiDraft && (
          <div
            className="fixed inset-0 z-[118] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
            onClick={() => setTopicAiDraft(null)}
          >
            <div
              className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-800">{t('topicWorkbench.aiImportPreviewTitle')}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t('topicWorkbench.aiImportPreviewDesc', {
                    name: topicAiDraft.connectionName,
                    file: topicAiDraft.sourceName,
                    count: topicAiDraft.topics.length,
                  })}
                </p>
              </div>
              <div className="px-5 py-4 space-y-3 overflow-y-auto">
                {topicAiDraft.summary && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-sm text-indigo-700">
                    {topicAiDraft.summary}
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="max-h-[52vh] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">{t('topicWorkbench.previewName')}</th>
                          <th className="text-left px-3 py-2 font-semibold">{t('topicWorkbench.previewTopic')}</th>
                          <th className="text-left px-3 py-2 font-semibold">{t('topicWorkbench.previewDirection')}</th>
                          <th className="text-left px-3 py-2 font-semibold">QoS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topicAiDraft.topics.map((item) => (
                          <tr key={item.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{item.name || '-'}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{item.topic}</td>
                            <td className="px-3 py-2 text-slate-600">{t(`topicWorkbench.direction.${item.direction}`)}</td>
                            <td className="px-3 py-2 text-slate-600">{item.qos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                <button
                  onClick={() => setTopicAiDraft(null)}
                  className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={applyAiTopicCatalogDraft}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-semibold"
                >
                  {t('topicWorkbench.aiImportConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        {quickAction && connections[quickAction.id] && (
          <SimpleInputModal
            isOpen={!!quickAction}
            onClose={() => setQuickAction(null)}
            title={quickAction.type === 'rename' ? t('app.quickAction.renameTitle') : t('app.quickAction.moveGroupTitle')}
            label={quickAction.type === 'rename' ? t('app.quickAction.renameLabel') : t('app.quickAction.groupLabel')}
            initialValue={quickAction.type === 'rename' ? connections[quickAction.id].profile.name : (connections[quickAction.id].profile.group || '')}
            options={quickAction.type === 'group' ? allGroupNames : undefined}
            onSave={(value) => {
              if (!quickAction) return;
              const conn = connections[quickAction.id];
              if (!conn) return;
              const updatedProfile = { ...conn.profile };
              if (quickAction.type === 'rename') updatedProfile.name = value;
              if (quickAction.type === 'group') {
                updatedProfile.group = value;
                setExpandedGroups(prev => ({ ...prev, [value]: true }));
              }
              handleSaveProfile(updatedProfile);
              setQuickAction(null);
            }}
          />
        )}

        {confirmDialog && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => {
              confirmDialog.resolver(false);
              setConfirmDialog(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-800">{confirmDialog.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{confirmDialog.message}</p>
              </div>
              <div className="px-5 py-4 flex items-center justify-end gap-2 bg-slate-50 rounded-b-xl">
                <button
                  onClick={() => {
                    confirmDialog.resolver(false);
                    setConfirmDialog(null);
                  }}
                  className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors text-sm font-medium"
                >
                  {confirmDialog.cancelLabel}
                </button>
                <button
                  onClick={() => {
                    confirmDialog.resolver(true);
                    setConfirmDialog(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                    confirmDialog.tone === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {activities.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[128] px-4 pb-3 pointer-events-none">
          <div className="mx-auto max-w-5xl rounded-xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-lg p-2 pointer-events-auto">
            <div className="flex flex-wrap gap-2">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`min-w-[220px] max-w-[360px] flex-1 rounded-lg border px-3 py-2 ${
                    activity.tone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : activity.tone === 'error'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <i
                      className={`mt-0.5 ${
                        activity.tone === 'success'
                          ? 'fas fa-circle-check'
                          : activity.tone === 'error'
                            ? 'fas fa-circle-exclamation'
                            : 'fas fa-spinner fa-spin'
                      }`}
                    ></i>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{activity.title}</div>
                      <div className="text-[11px] opacity-90 break-all">{activity.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-4 right-4 z-[130] space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[260px] max-w-[360px] rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-2 duration-200 ${
              toast.tone === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-700'
                : toast.tone === 'error'
                  ? 'bg-red-50/95 border-red-200 text-red-700'
                  : 'bg-slate-100/95 border-slate-300 text-slate-700'
            }`}
          >
            <div className="flex items-start gap-2">
              <i
                className={`mt-0.5 ${
                  toast.tone === 'success'
                    ? 'fas fa-circle-check'
                    : toast.tone === 'error'
                      ? 'fas fa-circle-exclamation'
                      : 'fas fa-circle-info'
                }`}
              ></i>
              <span className="text-sm leading-relaxed">{toast.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
