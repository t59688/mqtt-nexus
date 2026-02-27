import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PayloadTemplate, PublishHistoryItem } from '../types';

interface PublisherProps {
  onPublish: (topic: string, payload: string, qos: 0 | 1 | 2, retain: boolean) => void;
  onGeneratePayload: (topic: string, description: string) => Promise<string>;
  isConnected: boolean;
  onNotify?: (message: string, tone?: 'info' | 'success' | 'error') => void;
  templates: PayloadTemplate[];
  history: PublishHistoryItem[];
  onTemplatesChange: (templates: PayloadTemplate[]) => void;
  onHistoryChange: (history: PublishHistoryItem[]) => void;
}

const Publisher: React.FC<PublisherProps> = ({
  onPublish,
  onGeneratePayload,
  isConnected,
  onNotify,
  templates,
  history,
  onTemplatesChange,
  onHistoryChange,
}) => {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('test/topic');
  const [payload, setPayload] = useState('{"msg": "hello world"}');
  const [qos, setQos] = useState<0 | 1 | 2>(0);
  const [retain, setRetain] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);

  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowHistoryDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePublish = () => {
    onPublish(topic, payload, qos, retain);
    addToHistory();
  };

  const addToHistory = () => {
    const newItem: PublishHistoryItem = { topic, payload, qos, retain, timestamp: Date.now() };
    const filtered = history.filter((h) => h.topic !== topic);
    onHistoryChange([newItem, ...filtered].slice(0, 20));
  };

  const selectHistoryItem = (item: PublishHistoryItem) => {
    setTopic(item.topic);
    setPayload(item.payload);
    setQos(item.qos);
    setRetain(item.retain);
    setShowHistoryDropdown(false);
  };

  const deleteHistoryItem = (e: React.MouseEvent, targetTopic: string) => {
    e.stopPropagation();
    onHistoryChange(history.filter((h) => h.topic !== targetTopic));
  };

  const handleAiGenerate = async () => {
    if (!isConnected) {
      return;
    }

    setIsGenerating(true);
    try {
      const newPayload = await onGeneratePayload(topic, '');
      setPayload(newPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('publisher.aiFailed');
      if (onNotify) {
        onNotify(message, 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const saveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName) {
      return;
    }

    const newTemplate: PayloadTemplate = {
      id: crypto.randomUUID(),
      name: newTemplateName,
      topic,
      payload,
    };

    onTemplatesChange([...templates, newTemplate]);
    setNewTemplateName('');
    setShowSaveTemplate(false);
  };

  const loadTemplate = (template: PayloadTemplate) => {
    setTopic(template.topic);
    setPayload(template.payload);
  };

  const deleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onTemplatesChange(templates.filter((t) => t.id !== id));
  };

  const filteredHistory = history.filter((h) => h.topic.toLowerCase().includes(topic.toLowerCase()));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <i className="fas fa-paper-plane text-indigo-500"></i>
          {t('publisher.title')}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setShowSaveTemplate(!showSaveTemplate)}
            className="p-1.5 text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
            title={t('publisher.saveTemplateTitle')}
          >
            <i className="fas fa-save"></i>
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        {showSaveTemplate && (
          <form onSubmit={saveTemplate} className="flex gap-2 p-2 bg-indigo-50 rounded-lg animate-in slide-in-from-top-2">
            <input
              autoFocus
              type="text"
              placeholder={t('publisher.templateNamePlaceholder')}
              className="flex-1 px-2 py-1 text-xs border border-indigo-200 rounded focus:ring-1 focus:ring-indigo-500"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
            />
            <button type="submit" className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700">
              {t('publisher.saveTemplate')}
            </button>
          </form>
        )}

        {templates.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar min-h-[32px]">
            {templates.map((t) => (
              <div
                key={t.id}
                onClick={() => loadTemplate(t)}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-full text-xs text-slate-700 cursor-pointer border border-slate-200 group transition-all"
                title={t.payload}
              >
                <i className="fas fa-bookmark text-indigo-300 text-[10px]"></i>
                <span className="font-medium truncate max-w-[100px]">{t.name}</span>
                <i
                  onClick={(e) => deleteTemplate(t.id, e)}
                  className="fas fa-times text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                ></i>
              </div>
            ))}
          </div>
        )}

        <div className="relative z-20">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">{t('publisher.topic')}</label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={topic}
              onFocus={() => setShowHistoryDropdown(true)}
              onChange={(e) => {
                setTopic(e.target.value);
                setShowHistoryDropdown(true);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-mono text-slate-700 bg-white"
              placeholder={t('publisher.topicPlaceholder')}
              autoComplete="off"
            />
            {topic && (
              <button
                onClick={() => {
                  setTopic('');
                  setPayload('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                <i className="fas fa-times-circle"></i>
              </button>
            )}
          </div>

          {showHistoryDropdown && filteredHistory.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-1"
            >
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                <span>{t('publisher.recentTopics')}</span>
                <span>{t('publisher.restoresPayload')}</span>
              </div>
              {filteredHistory.map((item) => (
                <div
                  key={item.topic}
                  onClick={() => selectHistoryItem(item)}
                  className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 group transition-colors"
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-mono text-xs font-bold text-slate-700 truncate">{item.topic}</span>
                    <button
                      onClick={(e) => deleteHistoryItem(e, item.topic)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span className="truncate max-w-[80%]">
                      {item.payload.substring(0, 50)}
                      {item.payload.length > 50 ? '...' : ''}
                    </span>
                    <span className="bg-slate-100 px-1 rounded text-slate-500">
                      Q{item.qos} {item.retain ? 'R' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-[100px]">
          <div className="flex justify-between items-end mb-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t('publisher.payload')}</label>
            <button
              onClick={handleAiGenerate}
              disabled={isGenerating || !isConnected}
              className="text-[10px] flex items-center gap-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors font-medium bg-indigo-50 px-2 py-0.5 rounded-full"
            >
              {isGenerating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>}
              {t('publisher.aiGenerate')}
            </button>
          </div>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-mono resize-none leading-relaxed"
            placeholder={t('publisher.payloadPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">{t('publisher.qos')}</label>
            <select
              value={qos}
              onChange={(e) => setQos(Number(e.target.value) as 0 | 1 | 2)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="0">{t('publisher.qosLabels.q0')}</option>
              <option value="1">{t('publisher.qosLabels.q1')}</option>
              <option value="2">{t('publisher.qosLabels.q2')}</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={retain}
                onChange={(e) => setRetain(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 font-medium">{t('publisher.retain')}</span>
            </label>
          </div>
        </div>

        <button
          onClick={handlePublish}
          disabled={!isConnected}
          className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <i className="fas fa-paper-plane"></i> {t('publisher.publishMessage')}
        </button>
      </div>
    </div>
  );
};

export default Publisher;
