import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ConnectionTopicDocument,
  Subscription,
  TopicCatalogItem,
  TopicDirection,
} from '../types';

interface TopicWorkbenchProps {
  connectionId: string;
  isConnected: boolean;
  document?: ConnectionTopicDocument;
  subscriptions: Subscription[];
  onDocumentChange: (connectionId: string, doc: ConnectionTopicDocument) => void;
  onPublishForConnection: (
    connectionId: string,
    topic: string,
    payload: string,
    qos: 0 | 1 | 2,
    retain: boolean
  ) => void;
  isConnectionConnected: (connectionId: string) => boolean;
  onSubscribe: (topic: string, qos: 0 | 1 | 2) => void;
  onUnsubscribe: (topic: string) => void;
  onToggleMute: (topic: string) => void;
  onGeneratePayload: (topic: string, description: string) => Promise<string>;
  onNotify?: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onImport: () => void;
  onAiImport: () => void;
  onExport: () => void;
  isAiImporting?: boolean;
  onConfirmDeleteTopic: (topicName: string) => Promise<boolean>;
}

const TOPIC_DOC_VERSION = '1.0';

interface TopicContextMenuState {
  x: number;
  y: number;
  topicId: string;
}

interface TopicContextMenuAction {
  key: string;
  label: string;
  icon: string;
  group: 'sub' | 'pub' | 'auto';
  disabled?: boolean;
  onClick: () => void;
}

type AutoPublishStopMode = 'manual' | 'count' | 'until';
type AutoPublishPayloadField = 'payloadTemplate' | 'payloadExample';

interface AutoPublishStatus {
  connectionId: string;
  topicId: string;
  topicName: string;
  intervalMs: number;
  stopMode: AutoPublishStopMode;
  remainingCount: number | null;
  untilTs: number | null;
}

interface AutoPublishTask extends AutoPublishStatus {
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
  timerId: number | null;
}

interface AutoPublishDialogState {
  connectionId: string;
  topicId: string;
  intervalSeconds: string;
  stopMode: AutoPublishStopMode;
  maxCount: string;
  untilLocal: string;
}

const createDefaultTopic = (): TopicCatalogItem => ({
  id: crypto.randomUUID(),
  name: 'New Topic',
  topic: '',
  direction: 'publish',
  qos: 0,
  retain: false,
  contentType: 'application/json',
  description: '',
  tags: [],
  payloadTemplate: '{\n  "msg": "hello"\n}',
  payloadExample: '',
  schema: '',
});

const directionOrder: Array<'all' | TopicDirection> = ['all', 'publish', 'subscribe', 'both'];

const canSubscribeDirection = (direction: TopicDirection): boolean =>
  direction === 'subscribe' || direction === 'both';

const canPublishDirection = (direction: TopicDirection): boolean =>
  direction === 'publish' || direction === 'both';

const clampMenuPosition = (
  x: number,
  y: number,
  actionCount: number,
  estimatedMenuWidth: number
) => {
  if (typeof window === 'undefined') {
    return { left: x, top: y };
  }
  const menuWidth = estimatedMenuWidth;
  const menuHeight = Math.max(44, 10 + actionCount * 34);
  const edge = 8;
  return {
    left: Math.max(edge, Math.min(x, window.innerWidth - menuWidth - edge)),
    top: Math.max(edge, Math.min(y, window.innerHeight - menuHeight - edge)),
  };
};

const formatDateTimeLocal = (timestamp: number): string => {
  const d = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parsePositiveInt = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getAutoPublishTaskId = (connectionId: string, topicId: string): string =>
  `${connectionId}::${topicId}`;

const AUTO_PUBLISH_UNTIL_PRESETS_MINUTES = [2, 5, 10, 60];

const TopicWorkbench: React.FC<TopicWorkbenchProps> = ({
  connectionId,
  isConnected,
  document,
  subscriptions,
  onDocumentChange,
  onPublishForConnection,
  isConnectionConnected,
  onSubscribe,
  onUnsubscribe,
  onToggleMute,
  onGeneratePayload,
  onNotify,
  onImport,
  onAiImport,
  onExport,
  isAiImporting = false,
  onConfirmDeleteTopic,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | TopicDirection>('all');
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [topicContextMenu, setTopicContextMenu] = useState<TopicContextMenuState | null>(null);
  const [autoPublishStatusMap, setAutoPublishStatusMap] = useState<Record<string, AutoPublishStatus>>({});
  const [autoPublishDialog, setAutoPublishDialog] = useState<AutoPublishDialogState | null>(null);

  const topics = document?.topics || [];
  const subscriptionSet = useMemo(() => new Set(subscriptions.map((sub) => sub.topic)), [subscriptions]);
  const autoPublishTasksRef = useRef<Record<string, AutoPublishTask>>({});
  const onPublishForConnectionRef = useRef(onPublishForConnection);
  const isConnectionConnectedRef = useRef(isConnectionConnected);
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onPublishForConnectionRef.current = onPublishForConnection;
  }, [onPublishForConnection]);

  useEffect(() => {
    isConnectionConnectedRef.current = isConnectionConnected;
  }, [isConnectionConnected]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const filteredTopics = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return topics.filter((item) => {
      if (directionFilter !== 'all' && item.direction !== directionFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.topic.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [topics, directionFilter, search]);

  const activeTopic = topics.find((item) => item.id === activeTopicId) || null;
  const canSubscribe = activeTopic ? canSubscribeDirection(activeTopic.direction) : false;
  const canPublish = activeTopic ? canPublishDirection(activeTopic.direction) : false;
  const isSubscribed = Boolean(activeTopic && subscriptionSet.has(activeTopic.topic));
  const contextMenuTopic = topicContextMenu
    ? topics.find((item) => item.id === topicContextMenu.topicId) || null
    : null;

  useEffect(() => {
    if (topics.length === 0) {
      setActiveTopicId(null);
      return;
    }
    if (!activeTopicId || !topics.some((item) => item.id === activeTopicId)) {
      setActiveTopicId(topics[0].id);
    }
  }, [connectionId, topics, activeTopicId]);

  useEffect(() => {
    if (!topicContextMenu) {
      return;
    }

    const dismiss = () => setTopicContextMenu(null);
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismissOnEscape);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', dismissOnEscape);
    };
  }, [topicContextMenu]);

  useEffect(() => {
    if (!topicContextMenu) {
      return;
    }
    if (!topics.some((item) => item.id === topicContextMenu.topicId)) {
      setTopicContextMenu(null);
    }
  }, [topics, topicContextMenu]);

  useEffect(() => {
    const validTopicIds = new Set(topics.map((item) => item.id));
    Object.entries(autoPublishTasksRef.current).forEach(([taskId, task]) => {
      if (task.connectionId !== connectionId) {
        return;
      }
      if (!validTopicIds.has(task.topicId)) {
        removeAutoPublishTask(taskId, { key: 'topicWorkbench.autoPublish.topicMissing', tone: 'error' });
      }
    });

    if (
      autoPublishDialog &&
      autoPublishDialog.connectionId === connectionId &&
      !validTopicIds.has(autoPublishDialog.topicId)
    ) {
      setAutoPublishDialog(null);
    }
  }, [topics, connectionId, autoPublishDialog]);

  useEffect(() => {
    setAutoPublishDialog(null);
  }, [connectionId]);

  useEffect(() => {
    if (isConnected) {
      return;
    }
    const runningEntries = Object.entries(autoPublishTasksRef.current);
    runningEntries.forEach(([taskId, task]) => {
      if (task.connectionId !== connectionId) {
        return;
      }
      removeAutoPublishTask(taskId, { key: 'topicWorkbench.autoPublish.disconnectedStop', tone: 'error' });
    });
  }, [isConnected, connectionId]);

  useEffect(
    () => () => {
      stopAllAutoPublish();
    },
    []
  );

  const persistTopics = (nextTopics: TopicCatalogItem[]) => {
    onDocumentChange(connectionId, {
      version: document?.version || TOPIC_DOC_VERSION,
      updatedAt: Date.now(),
      topics: nextTopics,
    });
  };

  const updateActiveTopic = (patch: Partial<TopicCatalogItem>) => {
    if (!activeTopic) {
      return;
    }
    persistTopics(topics.map((item) => (item.id === activeTopic.id ? { ...item, ...patch } : item)));
  };

  const addTopic = () => {
    const item = createDefaultTopic();
    persistTopics([...topics, item]);
    setActiveTopicId(item.id);
  };

  const deleteActiveTopic = async () => {
    if (!activeTopic) {
      return;
    }
    const confirmed = await onConfirmDeleteTopic(activeTopic.name || activeTopic.topic || activeTopic.id);
    if (!confirmed) {
      return;
    }
    persistTopics(topics.filter((item) => item.id !== activeTopic.id));
  };

  const generatePayload = async () => {
    if (!activeTopic) {
      return;
    }
    if (!activeTopic.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }
    setIsGenerating(true);
    try {
      const generated = await onGeneratePayload(
        activeTopic.topic,
        activeTopic.description || ''
      );
      updateActiveTopic({ payloadTemplate: generated });
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : t('publisher.aiFailed'), 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const publishTopicFromField = (
    topicItem: TopicCatalogItem,
    field: 'payloadTemplate' | 'payloadExample'
  ) => {
    if (!canPublishDirection(topicItem.direction)) {
      return;
    }
    if (!isConnected) {
      onNotify?.(t('topicWorkbench.connectRequired'), 'error');
      return;
    }
    if (!topicItem.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }
    const payload = (topicItem[field] || '').trim();
    if (!payload) {
      onNotify?.(t('topicWorkbench.payloadRequired'), 'error');
      return;
    }
    onPublishForConnection(connectionId, topicItem.topic, payload, topicItem.qos, topicItem.retain);
  };

  const resolveAutoPublishField = (topicItem: TopicCatalogItem): AutoPublishPayloadField | null => {
    if ((topicItem.payloadTemplate || '').trim()) {
      return 'payloadTemplate';
    }
    if ((topicItem.payloadExample || '').trim()) {
      return 'payloadExample';
    }
    return null;
  };

  const clearAutoPublishTimer = (taskId: string) => {
    const task = autoPublishTasksRef.current[taskId];
    if (!task || task.timerId === null) {
      return;
    }
    window.clearTimeout(task.timerId);
    task.timerId = null;
  };

  const removeAutoPublishTask = (
    taskId: string,
    notify?: { key: string; tone?: 'info' | 'success' | 'error'; vars?: Record<string, string | number> }
  ) => {
    const task = autoPublishTasksRef.current[taskId];
    clearAutoPublishTimer(taskId);
    delete autoPublishTasksRef.current[taskId];
    setAutoPublishStatusMap((prev) => {
      if (!prev[taskId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    if (notify) {
      const vars = {
        name: task?.topicName || '',
        ...(notify.vars || {}),
      };
      onNotifyRef.current?.(t(notify.key, vars), notify.tone || 'info');
    }
  };

  const stopAllAutoPublish = () => {
    Object.keys(autoPublishTasksRef.current).forEach((taskId) => {
      clearAutoPublishTimer(taskId);
      delete autoPublishTasksRef.current[taskId];
    });
    setAutoPublishStatusMap({});
  };

  const runAutoPublishTick = (taskId: string) => {
    const task = autoPublishTasksRef.current[taskId];
    if (!task) {
      return;
    }

    if (!isConnectionConnectedRef.current(task.connectionId)) {
      removeAutoPublishTask(taskId, { key: 'topicWorkbench.autoPublish.disconnectedStop', tone: 'error' });
      return;
    }

    if (task.stopMode === 'until' && task.untilTs !== null && Date.now() >= task.untilTs) {
      removeAutoPublishTask(taskId, {
        key: 'topicWorkbench.autoPublish.completedUntil',
        tone: 'success',
      });
      return;
    }

    onPublishForConnectionRef.current(task.connectionId, task.topic, task.payload, task.qos, task.retain);

    if (task.stopMode === 'count' && task.remainingCount !== null) {
      task.remainingCount -= 1;
      if (task.remainingCount <= 0) {
        removeAutoPublishTask(taskId, {
          key: 'topicWorkbench.autoPublish.completedCount',
          tone: 'success',
        });
        return;
      }
    }

    setAutoPublishStatusMap((prev) => ({
      ...prev,
      [taskId]: {
        connectionId: task.connectionId,
        topicId: task.topicId,
        topicName: task.topicName,
        intervalMs: task.intervalMs,
        stopMode: task.stopMode,
        remainingCount: task.remainingCount,
        untilTs: task.untilTs,
      },
    }));

    task.timerId = window.setTimeout(() => runAutoPublishTick(taskId), task.intervalMs);
  };

  const stopAutoPublish = (taskId: string, notify = true) => {
    removeAutoPublishTask(
      taskId,
      notify
        ? {
            key: 'topicWorkbench.autoPublish.stopped',
            tone: 'info',
          }
        : undefined
    );
  };

  const startAutoPublish = (
    topicItem: TopicCatalogItem,
    options: { intervalSeconds: number; stopMode: AutoPublishStopMode; maxCount: number | null; untilTs: number | null }
  ) => {
    if (!canPublishDirection(topicItem.direction)) {
      return;
    }
    if (!isConnected) {
      onNotify?.(t('topicWorkbench.connectRequired'), 'error');
      return;
    }
    if (!topicItem.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }

    const field = resolveAutoPublishField(topicItem);
    if (!field) {
      onNotify?.(t('topicWorkbench.autoPublish.payloadMissing'), 'error');
      return;
    }

    const payload = (topicItem[field] || '').trim();
    if (!payload) {
      onNotify?.(t('topicWorkbench.autoPublish.payloadMissing'), 'error');
      return;
    }

    const taskId = getAutoPublishTaskId(connectionId, topicItem.id);
    stopAutoPublish(taskId, false);
    const task: AutoPublishTask = {
      connectionId,
      topicId: topicItem.id,
      topicName: topicItem.name || topicItem.topic,
      intervalMs: options.intervalSeconds * 1000,
      stopMode: options.stopMode,
      remainingCount: options.stopMode === 'count' ? options.maxCount : null,
      untilTs: options.stopMode === 'until' ? options.untilTs : null,
      topic: topicItem.topic,
      payload,
      qos: topicItem.qos,
      retain: topicItem.retain,
      timerId: null,
    };

    autoPublishTasksRef.current[taskId] = task;
    setAutoPublishStatusMap((prev) => ({
      ...prev,
      [taskId]: {
        connectionId,
        topicId: topicItem.id,
        topicName: task.topicName,
        intervalMs: task.intervalMs,
        stopMode: task.stopMode,
        remainingCount: task.remainingCount,
        untilTs: task.untilTs,
      },
    }));

    task.timerId = window.setTimeout(() => runAutoPublishTick(taskId), task.intervalMs);
    onNotify?.(
      t('topicWorkbench.autoPublish.started', {
        name: task.topicName,
        interval: options.intervalSeconds,
      }),
      'success'
    );
  };

  const openAutoPublishDialog = (topicItem: TopicCatalogItem) => {
    setAutoPublishDialog({
      connectionId,
      topicId: topicItem.id,
      intervalSeconds: '5',
      stopMode: 'manual',
      maxCount: '10',
      untilLocal: formatDateTimeLocal(Date.now() + 2 * 60 * 1000),
    });
  };

  const submitAutoPublishDialog = () => {
    if (!autoPublishDialog) {
      return;
    }

    if (autoPublishDialog.connectionId !== connectionId) {
      setAutoPublishDialog(null);
      return;
    }

    const topicItem = topics.find((item) => item.id === autoPublishDialog.topicId);
    if (!topicItem) {
      onNotify?.(t('topicWorkbench.connectionMissing'), 'error');
      setAutoPublishDialog(null);
      return;
    }

    const intervalSeconds = parsePositiveInt(autoPublishDialog.intervalSeconds);
    if (!intervalSeconds) {
      onNotify?.(t('topicWorkbench.autoPublish.invalidInterval'), 'error');
      return;
    }

    let maxCount: number | null = null;
    if (autoPublishDialog.stopMode === 'count') {
      maxCount = parsePositiveInt(autoPublishDialog.maxCount);
      if (!maxCount) {
        onNotify?.(t('topicWorkbench.autoPublish.invalidCount'), 'error');
        return;
      }
    }

    let untilTs: number | null = null;
    if (autoPublishDialog.stopMode === 'until') {
      const parsed = new Date(autoPublishDialog.untilLocal).getTime();
      if (!Number.isFinite(parsed) || parsed <= Date.now()) {
        onNotify?.(t('topicWorkbench.autoPublish.invalidUntil'), 'error');
        return;
      }
      untilTs = parsed;
    }

    startAutoPublish(topicItem, {
      intervalSeconds,
      stopMode: autoPublishDialog.stopMode,
      maxCount,
      untilTs,
    });
    setAutoPublishDialog(null);
  };

  const formatAutoPublishStatusText = (status: AutoPublishStatus): string => {
    const intervalSeconds = Math.max(1, Math.round(status.intervalMs / 1000));
    if (status.stopMode === 'count') {
      return t('topicWorkbench.autoPublish.statusCount', {
        remaining: status.remainingCount || 0,
        interval: intervalSeconds,
      });
    }
    if (status.stopMode === 'until' && status.untilTs !== null) {
      return t('topicWorkbench.autoPublish.statusUntil', {
        time: new Date(status.untilTs).toLocaleTimeString([], {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        interval: intervalSeconds,
      });
    }
    return t('topicWorkbench.autoPublish.statusManual', { interval: intervalSeconds });
  };

  const subscribeTopic = (topicItem: TopicCatalogItem) => {
    if (!canSubscribeDirection(topicItem.direction)) {
      return;
    }
    if (!isConnected) {
      onNotify?.(t('topicWorkbench.connectRequired'), 'error');
      return;
    }
    if (!topicItem.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }
    onSubscribe(topicItem.topic, topicItem.qos);
  };

  const unsubscribeTopic = (topicItem: TopicCatalogItem) => {
    if (!canSubscribeDirection(topicItem.direction)) {
      return;
    }
    if (!isConnected) {
      onNotify?.(t('topicWorkbench.connectRequired'), 'error');
      return;
    }
    if (!topicItem.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }
    onUnsubscribe(topicItem.topic);
  };

  const publishFromField = (field: 'payloadTemplate' | 'payloadExample') => {
    if (!activeTopic) {
      return;
    }
    publishTopicFromField(activeTopic, field);
  };

  const toggleSubscribe = () => {
    if (!activeTopic || !canSubscribe) {
      return;
    }
    if (isSubscribed) {
      unsubscribeTopic(activeTopic);
      return;
    }
    subscribeTopic(activeTopic);
  };

  const normalizeJsonField = (field: 'payloadTemplate' | 'payloadExample' | 'schema') => {
    if (!activeTopic) {
      return;
    }
    const raw = activeTopic[field];
    if (!raw || !raw.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      updateActiveTopic({ [field]: JSON.stringify(parsed, null, 2) });
    } catch {
      onNotify?.(t('topicWorkbench.invalidJson'), 'error');
    }
  };

  const topicContextActions: TopicContextMenuAction[] = [];
  if (contextMenuTopic) {
    const contextTaskId = getAutoPublishTaskId(connectionId, contextMenuTopic.id);
    const contextTopicSubscribed = subscriptionSet.has(contextMenuTopic.topic);
    const autoPublishActive = Boolean(autoPublishStatusMap[contextTaskId]);
    if (canSubscribeDirection(contextMenuTopic.direction)) {
      topicContextActions.push(
        {
          key: 'subscribe',
          label: t('topicWorkbench.contextMenu.subscribe'),
          icon: 'fa-rss',
          group: 'sub',
          disabled: !isConnected || !contextMenuTopic.topic.trim(),
          onClick: () => subscribeTopic(contextMenuTopic),
        },
        {
          key: 'unsubscribe',
          label: t('topicWorkbench.contextMenu.unsubscribe'),
          icon: 'fa-eye-slash',
          group: 'sub',
          disabled: !isConnected || !contextMenuTopic.topic.trim() || !contextTopicSubscribed,
          onClick: () => unsubscribeTopic(contextMenuTopic),
        }
      );
    }
    if (canPublishDirection(contextMenuTopic.direction)) {
      topicContextActions.push(
        {
          key: 'publishExample',
          label: t('topicWorkbench.contextMenu.publishExample'),
          icon: 'fa-vial',
          group: 'pub',
          disabled:
            !isConnected || !contextMenuTopic.topic.trim() || !(contextMenuTopic.payloadExample || '').trim(),
          onClick: () => publishTopicFromField(contextMenuTopic, 'payloadExample'),
        },
        {
          key: 'publishTemplate',
          label: t('topicWorkbench.contextMenu.publishTemplate'),
          icon: 'fa-paper-plane',
          group: 'pub',
          disabled:
            !isConnected || !contextMenuTopic.topic.trim() || !(contextMenuTopic.payloadTemplate || '').trim(),
          onClick: () => publishTopicFromField(contextMenuTopic, 'payloadTemplate'),
        }
      );
      if (autoPublishActive) {
        topicContextActions.push({
          key: 'stopAutoPublish',
          label: t('topicWorkbench.contextMenu.stopAutoPublish'),
          icon: 'fa-stop',
          group: 'auto',
          onClick: () => stopAutoPublish(contextTaskId),
        });
      } else {
        topicContextActions.push({
          key: 'startAutoPublish',
          label: t('topicWorkbench.contextMenu.startAutoPublish'),
          icon: 'fa-clock',
          group: 'auto',
          disabled: !isConnected || !contextMenuTopic.topic.trim(),
          onClick: () => openAutoPublishDialog(contextMenuTopic),
        });
      }
    }
  }

  const estimatedMenuWidth = Math.min(
    240,
    Math.max(
      92,
      72 +
        topicContextActions.reduce((max, action) => {
          return Math.max(max, action.label.length * 7.2);
        }, 0)
    )
  );

  const topicMenuPosition = topicContextMenu
    ? clampMenuPosition(
        topicContextMenu.x,
        topicContextMenu.y,
        topicContextActions.length,
        estimatedMenuWidth
      )
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <i className="fas fa-diagram-project text-indigo-500"></i>
            {t('topicWorkbench.title')}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={onImport}
              className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              <i className="fas fa-file-import mr-1"></i>
              {t('common.import')}
            </button>
            <button
              onClick={onAiImport}
              disabled={isAiImporting}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                isAiImporting
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-400 cursor-not-allowed'
                  : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <i className={`mr-1 ${isAiImporting ? 'fas fa-spinner fa-spin' : 'fas fa-wand-magic-sparkles'}`}></i>
              {isAiImporting ? t('topicWorkbench.aiImporting') : t('topicWorkbench.aiImport')}
            </button>
            <button
              onClick={onExport}
              className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              <i className="fas fa-file-export mr-1"></i>
              {t('common.export')}
            </button>
            <button
              onClick={addTopic}
              className="px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <i className="fas fa-plus mr-1"></i>
              {t('topicWorkbench.addTopic')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('topicWorkbench.searchPlaceholder')}
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <select
            value={directionFilter}
            onChange={(event) => setDirectionFilter(event.target.value as 'all' | TopicDirection)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
          >
            {directionOrder.map((direction) => (
              <option key={direction} value={direction}>
                {t(`topicWorkbench.direction.${direction}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-5 border-r border-slate-100 overflow-y-auto custom-scrollbar">
          {filteredTopics.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 text-center text-slate-400">
              <i className="fas fa-inbox text-3xl mb-2"></i>
              <p className="text-sm">{t('topicWorkbench.empty')}</p>
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {filteredTopics.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTopicId(item.id);
                    setTopicContextMenu(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setActiveTopicId(item.id);
                    setTopicContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      topicId: item.id,
                    });
                  }}
                  className={`w-full text-left p-1.5 rounded-lg border transition-all ${
                    item.id === activeTopic?.id
                      ? 'border-indigo-300 bg-indigo-50/70'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                  }`}
                >
                  {autoPublishStatusMap[getAutoPublishTaskId(connectionId, item.id)] && (
                    <div className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">
                      <i className="fas fa-clock text-[9px] text-emerald-600"></i>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                        {t('topicWorkbench.autoPublish.statusTag')}
                      </span>
                      <span className="text-[9px] text-emerald-600">
                        {formatAutoPublishStatusText(autoPublishStatusMap[getAutoPublishTaskId(connectionId, item.id)])}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-700 truncate">{item.name || item.topic}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                      {t(`topicWorkbench.badge.${item.direction}`)}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">{item.topic || '-'}</div>
                  <div className="mt-1 text-[10px] text-slate-400 flex items-center gap-2">
                    <span>QoS {item.qos}</span>
                    {item.retain && <span>{t('publisher.retain')}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="xl:col-span-7 overflow-y-auto custom-scrollbar p-2.5 space-y-2">
          {!activeTopic ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              {t('topicWorkbench.selectTopic')}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500 font-mono truncate">
                  {activeTopic.topic || t('topicWorkbench.topicPlaceholder')}
                </div>
                <button
                  onClick={() => {
                    void deleteActiveTopic();
                  }}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 px-2 py-1 rounded transition-colors"
                >
                  <i className="fas fa-trash mr-1"></i>
                  {t('common.delete')}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <input
                  value={activeTopic.name}
                  onChange={(event) => updateActiveTopic({ name: event.target.value })}
                  placeholder={t('topicWorkbench.namePlaceholder')}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  value={activeTopic.topic}
                  onChange={(event) => updateActiveTopic({ topic: event.target.value })}
                  placeholder={t('topicWorkbench.topicPlaceholder')}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activeTopic.direction}
                  onChange={(event) => updateActiveTopic({ direction: event.target.value as TopicDirection })}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="publish">{t('topicWorkbench.direction.publish')}</option>
                  <option value="subscribe">{t('topicWorkbench.direction.subscribe')}</option>
                  <option value="both">{t('topicWorkbench.direction.both')}</option>
                </select>
                <select
                  value={activeTopic.qos}
                  onChange={(event) => updateActiveTopic({ qos: Number(event.target.value) as 0 | 1 | 2 })}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="0">{t('publisher.qosLabels.q0')}</option>
                  <option value="1">{t('publisher.qosLabels.q1')}</option>
                  <option value="2">{t('publisher.qosLabels.q2')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  value={activeTopic.contentType || ''}
                  onChange={(event) => updateActiveTopic({ contentType: event.target.value })}
                  placeholder={t('topicWorkbench.contentType')}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                />
                <label className="text-xs text-slate-600 flex items-center gap-2 border border-slate-200 rounded px-2">
                  <input
                    type="checkbox"
                    checked={activeTopic.retain}
                    onChange={(event) => updateActiveTopic({ retain: event.target.checked })}
                    className="w-3.5 h-3.5"
                  />
                  {t('publisher.retain')}
                </label>
              </div>

              <input
                value={activeTopic.tags.join(', ')}
                onChange={(event) =>
                  updateActiveTopic({
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter((tag) => tag.length > 0),
                  })
                }
                placeholder={t('topicWorkbench.tagsPlaceholder')}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
              />

              <textarea
                value={activeTopic.description || ''}
                onChange={(event) => updateActiveTopic({ description: event.target.value })}
                placeholder={t('topicWorkbench.descriptionPlaceholder')}
                className="w-full min-h-[64px] px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 resize-y"
              />

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {t('topicWorkbench.payloadTemplate')}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => normalizeJsonField('payloadTemplate')}
                      className="text-[10px] text-slate-500 hover:text-indigo-600"
                    >
                      {t('topicWorkbench.formatJson')}
                    </button>
                    <button
                      onClick={() => {
                        void generatePayload();
                      }}
                      disabled={isGenerating || !isConnected}
                      className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 disabled:opacity-50"
                    >
                      {isGenerating ? t('topicWorkbench.generating') : t('publisher.aiGenerate')}
                    </button>
                  </div>
                </div>
                <textarea
                  value={activeTopic.payloadTemplate || ''}
                  onChange={(event) => updateActiveTopic({ payloadTemplate: event.target.value })}
                  placeholder={t('publisher.payloadPlaceholder')}
                  className="w-full min-h-[110px] px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 resize-y font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {t('topicWorkbench.payloadExample')}
                  </label>
                  <button
                    onClick={() => normalizeJsonField('payloadExample')}
                    className="text-[10px] text-slate-500 hover:text-indigo-600"
                  >
                    {t('topicWorkbench.formatJson')}
                  </button>
                </div>
                <textarea
                  value={activeTopic.payloadExample || ''}
                  onChange={(event) => updateActiveTopic({ payloadExample: event.target.value })}
                  placeholder={t('publisher.payloadPlaceholder')}
                  className="w-full min-h-[90px] px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 resize-y font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {t('topicWorkbench.schema')}
                  </label>
                  <button
                    onClick={() => normalizeJsonField('schema')}
                    className="text-[10px] text-slate-500 hover:text-indigo-600"
                  >
                    {t('topicWorkbench.formatJson')}
                  </button>
                </div>
                <textarea
                  value={activeTopic.schema || ''}
                  onChange={(event) => updateActiveTopic({ schema: event.target.value })}
                  placeholder='{ "type": "object" }'
                  className="w-full min-h-[80px] px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 resize-y font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => publishFromField('payloadTemplate')}
                  disabled={!canPublish || !isConnected}
                  title={t('topicWorkbench.publishTemplate')}
                  className="px-2 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300 inline-flex items-center justify-center min-w-[2.25rem]"
                >
                  <i className="fas fa-paper-plane" aria-hidden></i>
                </button>
                <button
                  onClick={() => publishFromField('payloadExample')}
                  disabled={!canPublish || !isConnected}
                  title={t('topicWorkbench.publishExample')}
                  className="px-2 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-800 text-white disabled:bg-slate-300 inline-flex items-center justify-center min-w-[2.25rem]"
                >
                  <i className="fas fa-vial" aria-hidden></i>
                </button>
                <button
                  onClick={toggleSubscribe}
                  disabled={!canSubscribe || !isConnected}
                  title={isSubscribed ? t('subscription.unsubscribe') : t('subscription.title')}
                  className={`px-2 py-1.5 text-xs rounded text-white disabled:bg-slate-300 inline-flex items-center justify-center min-w-[2.25rem] ${
                    isSubscribed ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <i className={`fas ${isSubscribed ? 'fa-eye-slash' : 'fa-rss'}`} aria-hidden></i>
                </button>
              </div>

              {subscriptions.length > 0 && (
                <div className="border border-slate-100 rounded-lg p-1.5 bg-slate-50/60">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1 tracking-wide">
                    {t('topicWorkbench.activeSubscriptions')}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {subscriptions.map((sub) => (
                      <div key={sub.topic} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-slate-600 truncate">{sub.topic}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onToggleMute(sub.topic)}
                            className="text-slate-400 hover:text-indigo-600 px-1"
                            title={sub.muted ? t('subscription.unmute') : t('subscription.mute')}
                          >
                            <i className={`fas ${sub.muted ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          </button>
                          <button
                            onClick={() => onUnsubscribe(sub.topic)}
                            className="text-slate-400 hover:text-red-600 px-1"
                            title={t('subscription.unsubscribe')}
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {autoPublishDialog && (
        <div
          className="fixed inset-0 z-[75] bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setAutoPublishDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">{t('topicWorkbench.autoPublish.title')}</h4>
              <p className="text-xs text-slate-500 mt-1">
                {topics.find((item) => item.id === autoPublishDialog.topicId)?.name ||
                  topics.find((item) => item.id === autoPublishDialog.topicId)?.topic}
              </p>
            </div>
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('topicWorkbench.autoPublish.intervalLabel')}</span>
                <input
                  type="number"
                  min={1}
                  value={autoPublishDialog.intervalSeconds}
                  onChange={(event) =>
                    setAutoPublishDialog((prev) =>
                      prev ? { ...prev, intervalSeconds: event.target.value } : prev
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">{t('topicWorkbench.autoPublish.stopModeLabel')}</span>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="auto-publish-stop-mode"
                    checked={autoPublishDialog.stopMode === 'manual'}
                    onChange={() =>
                      setAutoPublishDialog((prev) =>
                        prev ? { ...prev, stopMode: 'manual' } : prev
                      )
                    }
                  />
                  {t('topicWorkbench.autoPublish.stopModeManual')}
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="auto-publish-stop-mode"
                    checked={autoPublishDialog.stopMode === 'count'}
                    onChange={() =>
                      setAutoPublishDialog((prev) =>
                        prev ? { ...prev, stopMode: 'count' } : prev
                      )
                    }
                  />
                  {t('topicWorkbench.autoPublish.stopModeCount')}
                </label>
                {autoPublishDialog.stopMode === 'count' && (
                  <input
                    type="number"
                    min={1}
                    value={autoPublishDialog.maxCount}
                    onChange={(event) =>
                      setAutoPublishDialog((prev) =>
                        prev ? { ...prev, maxCount: event.target.value } : prev
                      )
                    }
                    placeholder={t('topicWorkbench.autoPublish.countLabel')}
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                )}
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="auto-publish-stop-mode"
                    checked={autoPublishDialog.stopMode === 'until'}
                    onChange={() =>
                      setAutoPublishDialog((prev) =>
                        prev ? { ...prev, stopMode: 'until' } : prev
                      )
                    }
                  />
                  {t('topicWorkbench.autoPublish.stopModeUntil')}
                </label>
                {autoPublishDialog.stopMode === 'until' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">{t('topicWorkbench.autoPublish.quickPresetLabel')}</span>
                      <div className="flex items-center gap-1">
                        {AUTO_PUBLISH_UNTIL_PRESETS_MINUTES.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            onClick={() =>
                              setAutoPublishDialog((prev) =>
                                prev
                                  ? { ...prev, untilLocal: formatDateTimeLocal(Date.now() + minutes * 60 * 1000) }
                                  : prev
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                          >
                            {t('topicWorkbench.autoPublish.quickPresetMinutes', { minutes })}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="sr-only">{t('topicWorkbench.autoPublish.untilLabel')}</span>
                      <input
                        type="datetime-local"
                        value={autoPublishDialog.untilLocal}
                        onChange={(event) =>
                          setAutoPublishDialog((prev) =>
                            prev ? { ...prev, untilLocal: event.target.value } : prev
                          )
                        }
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setAutoPublishDialog(null)}
                className="px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitAutoPublishDialog}
                className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
              >
                {t('topicWorkbench.autoPublish.start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {topicContextMenu && contextMenuTopic && topicContextActions.length > 0 && topicMenuPosition && (
        <div
          className="fixed z-[70] min-w-[140px] w-auto rounded-lg border border-slate-200 bg-white p-1 shadow-2xl shadow-slate-900/15"
          style={{ left: topicMenuPosition.left, top: topicMenuPosition.top }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {topicContextActions.map((action, index) => {
            const needsDivider = index > 0 && action.group !== topicContextActions[index - 1].group;
            const iconToneClass =
              action.key === 'unsubscribe' || action.key === 'stopAutoPublish'
                ? 'text-red-500'
                : action.group === 'sub'
                  ? 'text-emerald-500'
                  : action.group === 'auto'
                    ? 'text-cyan-600'
                    : action.key === 'publishTemplate'
                    ? 'text-indigo-500'
                    : 'text-slate-500';

            return (
              <button
                key={action.key}
                disabled={action.disabled}
                onClick={() => {
                  if (action.disabled) {
                    return;
                  }
                  action.onClick();
                  setTopicContextMenu(null);
                }}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors w-full ${
                  needsDivider ? 'mt-1 pt-2 border-t border-slate-100' : ''
                } ${
                  action.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="w-4 flex-shrink-0 text-[10px] text-slate-400">{index + 1}.</span>
                <i className={`fas ${action.icon} w-3 flex-shrink-0 text-center ${action.disabled ? 'text-slate-300' : iconToneClass}`}></i>
                <span className="whitespace-nowrap flex-shrink-0">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TopicWorkbench;
