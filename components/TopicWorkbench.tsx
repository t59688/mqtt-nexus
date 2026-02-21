import React, { useEffect, useMemo, useState } from 'react';
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
  onPublish: (topic: string, payload: string, qos: 0 | 1 | 2, retain: boolean) => void;
  onSubscribe: (topic: string, qos: 0 | 1 | 2) => void;
  onUnsubscribe: (topic: string) => void;
  onToggleMute: (topic: string) => void;
  onGeneratePayload: (topic: string, description: string) => Promise<string>;
  onNotify?: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onImport: () => void;
  onExport: () => void;
  onConfirmDeleteTopic: (topicName: string) => Promise<boolean>;
}

const TOPIC_DOC_VERSION = '1.0';

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

const TopicWorkbench: React.FC<TopicWorkbenchProps> = ({
  connectionId,
  isConnected,
  document,
  subscriptions,
  onDocumentChange,
  onPublish,
  onSubscribe,
  onUnsubscribe,
  onToggleMute,
  onGeneratePayload,
  onNotify,
  onImport,
  onExport,
  onConfirmDeleteTopic,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | TopicDirection>('all');
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const topics = document?.topics || [];
  const subscriptionSet = useMemo(() => new Set(subscriptions.map((sub) => sub.topic)), [subscriptions]);

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
  const canSubscribe = activeTopic?.direction === 'subscribe' || activeTopic?.direction === 'both';
  const canPublish = activeTopic?.direction === 'publish' || activeTopic?.direction === 'both';
  const isSubscribed = Boolean(activeTopic && subscriptionSet.has(activeTopic.topic));

  useEffect(() => {
    if (topics.length === 0) {
      setActiveTopicId(null);
      return;
    }
    if (!activeTopicId || !topics.some((item) => item.id === activeTopicId)) {
      setActiveTopicId(topics[0].id);
    }
  }, [connectionId, topics, activeTopicId]);

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
        activeTopic.description || t('publisher.aiPrompt')
      );
      updateActiveTopic({ payloadTemplate: generated });
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : t('publisher.aiFailed'), 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const publishFromField = (field: 'payloadTemplate' | 'payloadExample') => {
    if (!activeTopic) {
      return;
    }
    if (!isConnected) {
      onNotify?.(t('topicWorkbench.connectRequired'), 'error');
      return;
    }
    if (!activeTopic.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }
    const payload = (activeTopic[field] || '').trim();
    if (!payload) {
      onNotify?.(t('topicWorkbench.payloadRequired'), 'error');
      return;
    }
    onPublish(activeTopic.topic, payload, activeTopic.qos, activeTopic.retain);
  };

  const toggleSubscribe = () => {
    if (!activeTopic || !canSubscribe) {
      return;
    }
    if (!isConnected) {
      onNotify?.(t('topicWorkbench.connectRequired'), 'error');
      return;
    }
    if (!activeTopic.topic.trim()) {
      onNotify?.(t('topicWorkbench.topicRequired'), 'error');
      return;
    }
    if (isSubscribed) {
      onUnsubscribe(activeTopic.topic);
      return;
    }
    onSubscribe(activeTopic.topic, activeTopic.qos);
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 space-y-3">
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
            <div className="h-full flex flex-col items-center justify-center px-6 text-center text-slate-400">
              <i className="fas fa-inbox text-3xl mb-2"></i>
              <p className="text-sm">{t('topicWorkbench.empty')}</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredTopics.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTopicId(item.id)}
                  className={`w-full text-left p-2 rounded-lg border transition-all ${
                    item.id === activeTopic?.id
                      ? 'border-indigo-300 bg-indigo-50/70'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                  }`}
                >
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

        <div className="xl:col-span-7 overflow-y-auto custom-scrollbar p-3 space-y-3">
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
                <div className="border border-slate-100 rounded-lg p-2 bg-slate-50/60">
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
    </div>
  );
};

export default TopicWorkbench;
