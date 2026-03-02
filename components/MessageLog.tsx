import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Message, Subscription } from '../types';

interface MessageLogProps {
  messages: Message[];
  subscriptions: Subscription[];
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => Promise<void> | void;
  onClear: () => Promise<void> | void;
  onExport: () => Promise<void> | void;
}

const MessageLog: React.FC<MessageLogProps> = ({
  messages,
  subscriptions,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onClear,
  onExport,
}) => {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadInFlightRef = useRef(false);
  const [filterText, setFilterText] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  // Helper to match MQTT topics with wildcards
  const findMatchingSubscription = (topic: string) => {
    // 1. Try exact match first
    const exact = subscriptions.find(s => s.topic === topic);
    if (exact) return exact;

    // 2. Try wildcard match
    return subscriptions.find(s => {
      // Convert MQTT wildcards to Regex
      // + matches any single level (non-slashes)
      // # matches anything at the end
      const pattern = s.topic
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars except wildcards
        .replace(/\\\+/g, '[^/]+')             // + matches one level
        .replace(/\\#/g, '.*');                // # matches everything

      return new RegExp(`^${pattern}$`).test(topic);
    });
  };

  // Auto-scroll effect
  useEffect(() => {
    if (!isPaused && !filterText) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isPaused, filterText]);

  // Filtering
  const filteredMessages = messages.filter(msg => {
    // 1. Filter out muted topics (Only for incoming messages)
    if (msg.direction === 'in') {
      const matchingSub = findMatchingSubscription(msg.topic);
      if (matchingSub && matchingSub.muted) {
        return false;
      }
    }

    // 2. Text Search Filter
    if (!filterText) return true;
    const term = filterText.toLowerCase();
    return msg.topic.toLowerCase().includes(term) || msg.payload.toLowerCase().includes(term);
  });

  const getTopicColor = (topic: string) => {
    const sub = findMatchingSubscription(topic);
    return sub ? sub.color : 'bg-zinc-500';
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
  };

  const handleListScroll = async (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (!hasMoreOlder || isLoadingOlder || loadInFlightRef.current || container.scrollTop > 80) {
      return;
    }

    loadInFlightRef.current = true;
    const previousHeight = container.scrollHeight;
    const previousTop = container.scrollTop;
    try {
      await onLoadOlder();
    } catch {
      loadInFlightRef.current = false;
      return;
    }

    window.requestAnimationFrame(() => {
      const target = listRef.current;
      if (!target) {
        loadInFlightRef.current = false;
        return;
      }
      const nextHeight = target.scrollHeight;
      target.scrollTop = nextHeight - previousHeight + previousTop;
      loadInFlightRef.current = false;
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm dark:shadow-black/30 border border-zinc-200 dark:border-zinc-800 h-full flex flex-col overflow-hidden relative">
      {/* Toolbar */}
      <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950 gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-50 flex items-center gap-2">
            <i className="fas fa-list-ul text-indigo-500 dark:text-indigo-400"></i>
            {t('messageLog.title')}
            <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-mono">{filteredMessages.length} <span className="text-zinc-400 dark:text-zinc-500 font-normal">/ {messages.length}</span></span>
          </h3>

          {/* Filter Input */}
          <div className="relative group">
            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 text-xs"></i>
            <input
              type="text"
              placeholder={t('messageLog.filterPlaceholder')}
              className="pl-7 pr-3 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-xs w-32 focus:w-48 transition-all focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/30 outline-none text-zinc-900 dark:text-zinc-100"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${isPaused ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            title={isPaused ? t('messageLog.resumeAutoScroll') : t('messageLog.pauseAutoScroll')}
          >
            {isPaused ? <i className="fas fa-play"></i> : <i className="fas fa-pause"></i>}
            <span className="hidden sm:inline">{isPaused ? t('common.resume') : t('common.pause')}</span>
          </button>
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700"></div>
          <button onClick={onClear} className="text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-rose-400 text-xs font-medium transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-rose-500/15">
            <i className="fas fa-trash-alt"></i> <span className="hidden sm:inline">{t('common.clear')}</span>
          </button>
          <button onClick={onExport} className="text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-medium transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-500/15">
            <i className="fas fa-file-export"></i> <span className="hidden sm:inline">{t('common.export')}</span>
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={(event) => { void handleListScroll(event); }}
        className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-zinc-50/30 dark:bg-zinc-950 custom-scrollbar relative"
      >
        {(hasMoreOlder || isLoadingOlder) && (
          <div className="flex justify-center mb-2">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-3 py-1">
              {isLoadingOlder ? t('messageLog.loadingOlder') : t('messageLog.scrollTopToLoadOlder')}
            </span>
          </div>
        )}
        {filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500 opacity-60">
            <i className="fas fa-inbox text-4xl mb-2"></i>
            <p>{messages.length > 0 ? t('messageLog.allFilteredOrMuted') : t('messageLog.noMessages')}</p>
          </div>
        )}

        {filteredMessages.map((msg) => {
          const isOut = msg.direction === 'out';
          const badgeColor = isOut ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30' : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30';
          const topicColor = !isOut ? getTopicColor(msg.topic).replace('bg-', 'text-') : 'text-zinc-600 dark:text-zinc-300';

          return (
            <div key={msg.id} className="flex gap-2 animate-in fade-in duration-200">
              <div className="flex flex-col items-center pt-1 min-w-[58px]">
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">{formatTime(msg.timestamp)}</span>
                <div className={`mt-1 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase border tracking-wider ${badgeColor}`}>
                  {t(`messageLog.direction.${msg.direction}`)}
                </div>
              </div>

              <div className={`flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 shadow-sm dark:shadow-black/20 hover:shadow-md dark:hover:shadow-black/40 transition-shadow ${isOut ? 'rounded-tl-none border-l-[2px] border-l-indigo-400/80 dark:border-l-indigo-500/70' : 'rounded-tr-none border-r-[2px] border-r-emerald-400/80 dark:border-r-emerald-500/70'}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className={`font-mono text-[11px] font-semibold break-all ${topicColor} bg-zinc-50 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-100 dark:border-zinc-700/50`}>
                    {msg.topic}
                  </span>
                  <div className="flex gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                    <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">QoS {msg.qos}</span>
                    {msg.retain && <span className="text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-200/50 dark:border-orange-500/20">{t('messageLog.retain')}</span>}
                  </div>
                </div>
                <pre className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto custom-scrollbar bg-zinc-50/80 dark:bg-zinc-950/30 p-2.5 rounded border border-zinc-100 dark:border-zinc-800/80 shadow-inner dark:shadow-none selection:bg-indigo-200 dark:selection:bg-indigo-500/30">
                  {msg.payload}
                </pre>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom indicator */}
      {isPaused && messages.length > filteredMessages.length && (
        <div
          onClick={() => { setIsPaused(false); setFilterText(''); }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 animate-bounce z-10"
        >
          {t('messageLog.resumeAndShowNew')}
        </div>
      )}
    </div>
  );
};

export default MessageLog;
