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
import { DEFAULT_PROFILE, DEFAULT_AI_CONFIG, getRandomColor } from './constants';
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

const MAX_MESSAGES_PER_CONNECTION = 1000;
const HISTORY_PAGE_SIZE = 200;
const MAX_LOG_VIEW_MESSAGES = 10000;
const TOPIC_DOC_VERSION = '1.0';
const APP_CONFIG_MAGIC = 'MQTT_NEXUS_APP_CONFIG_V1';
const TOPIC_CATALOG_MAGIC = 'MQTT_NEXUS_TOPIC_CATALOG_V1';

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

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [connections, setConnections] = useState<Record<string, ConnectionState>>({});
  const [brokers, setBrokers] = useState<BrokerConfig[]>([]);
  const [identities, setIdentities] = useState<AuthIdentity[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'brokers' | 'identities'>('general');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [quickAction, setQuickAction] = useState<{ type: 'rename' | 'group'; id: string } | null>(null);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | undefined>(undefined);
  const [connectionSearch, setConnectionSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [publisherTemplates, setPublisherTemplates] = useState<PayloadTemplate[]>([]);
  const [connectionTopicDocs, setConnectionTopicDocs] = useState<Record<string, ConnectionTopicDocument>>({});
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const topicFileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedConfigRef = useRef('');
  const toastTimersRef = useRef<number[]>([]);
  const activityTimersRef = useRef<number[]>([]);
  const activeIdRef = useRef<string | null>(null);
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
        if (!isTauriRuntime()) {
          applyProfiles([]);
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

        applyProfiles(loadedProfiles, loaded.activeConnectionId);
      } catch (error) {
        console.error('Failed to load app config', error);
        applyProfiles([]);
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
  }, [theme]);

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
      connections: Object.values(connections).map((c) => c.profile),
      brokers,
      identities,
      aiConfig,
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
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (activeId && connections[activeId]) {
          await navigator.clipboard.writeText(`MQTT_NEXUS_PROFILE:${JSON.stringify(connections[activeId].profile)}`);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        try {
          const text = await navigator.clipboard.readText();
          if (!text.startsWith('MQTT_NEXUS_PROFILE:')) return;
          const profile = normalizeProfile(JSON.parse(text.substring('MQTT_NEXUS_PROFILE:'.length)) as ConnectionProfile);
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
        } catch (err) {
          console.error('Paste failed', err);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeId, connections, t, connectionTopicDocs]);

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
      connections: Object.values(connections).map((c) => c.profile),
      brokers,
      identities,
      aiConfig,
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

  const openSettings = (tab: 'general' | 'brokers' | 'identities' = 'general') => {
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

  const generatePayload = async (topic: string, description: string) =>
    invokeCommand<string>('ai_generate_payload', { topic, description, options: aiConfig });

  const confirmDeleteTopic = async (topicName: string) =>
    askConfirm({
      title: t('common.delete'),
      message: t('topicWorkbench.confirmDeleteTopic', { name: topicName }),
      tone: 'danger',
      confirmLabel: t('common.delete'),
    });

  const getGroupedConnections = () => {
    const groups: Record<string, ConnectionState[]> = {};
    Object.values(connections).forEach((c) => {
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

  const groupedConnections = getGroupedConnections();
  const sortedGroupNames = Object.keys(groupedConnections).sort();
  const allGroupNames = Array.from(new Set(Object.values(connections).map((c) => c.profile.group || 'General')));
  const welcomeDescriptionLines = t('app.welcomeDescription').split('\n');
  const activeTopicDoc = activeConnection ? connectionTopicDocs[activeConnection.profile.id] : undefined;

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

      <div className={`${sidebarOpen ? 'w-80' : 'w-0 opacity-0'} bg-slate-900 flex flex-col border-r border-slate-800 shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap`}>
        <div className="p-5 flex items-center justify-between border-b border-slate-800 bg-slate-950/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
              <i className="fas fa-bolt"></i>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">NexusMQTT</h1>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-500 hover:text-slate-200 transition-colors">
            <i className="fas fa-angle-left text-lg"></i>
          </button>
        </div>

        <div className="p-3 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
            <input type="text" placeholder={t('app.searchConnections')} className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" value={connectionSearch} onChange={e => setConnectionSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-1 custom-scrollbar">
          {sortedGroupNames.map(groupName => (
            <div key={groupName} className="mb-2">
              <div onClick={() => setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))} className="px-4 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors select-none group">
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
                      isActive={activeId === c.profile.id}
                      onSelect={() => setActiveId(c.profile.id)}
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

        <div className="p-4 border-t border-slate-800 bg-slate-950/30 space-y-2">
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

      <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-50">
        {activeConnection ? (
          <>
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 flex-shrink-0">
              <div className="flex items-center gap-4 overflow-hidden">
                {!sidebarOpen && (
                  <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-indigo-600 transition-colors mr-2">
                    <i className="fas fa-bars text-lg"></i>
                  </button>
                )}
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate">
                    {activeConnection.profile.name}
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
              <div className="bg-red-50 text-red-700 px-6 py-2 text-xs border-b border-red-100 flex items-center gap-2 animate-in slide-in-from-top-2">
                <i className="fas fa-exclamation-circle"></i> <span className="font-semibold">{t('app.connectionError')}</span> {activeConnection.lastError}
              </div>
            )}

            <main className="flex-1 p-4 lg:p-6 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                <div className="lg:col-span-4 h-full min-h-[500px]">
                  <TopicWorkbench
                    connectionId={activeConnection.profile.id}
                    isConnected={activeConnection.status === 'connected'}
                    subscriptions={activeConnection.subscriptions}
                    document={activeTopicDoc}
                    onDocumentChange={upsertConnectionTopicDocument}
                    onPublish={(topic, payload, qos, retain) => {
                      void publish(activeConnection.profile.id, topic, payload, qos, retain);
                    }}
                    onSubscribe={(topic, qos) => {
                      void subscribe(activeConnection.profile.id, topic, qos);
                    }}
                    onUnsubscribe={(topic) => {
                      void unsubscribe(activeConnection.profile.id, topic);
                    }}
                    onToggleMute={(topic) => toggleMute(activeConnection.profile.id, topic)}
                    onGeneratePayload={generatePayload}
                    onNotify={(message, tone = 'info') => pushToast(message, tone)}
                    onImport={() => triggerTopicCatalogImport(activeConnection.profile.id)}
                    onExport={() => exportConnectionTopicCatalog(activeConnection.profile.id)}
                    onConfirmDeleteTopic={confirmDeleteTopic}
                  />
                </div>
                <div className="lg:col-span-8 h-full min-h-[500px]">
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
