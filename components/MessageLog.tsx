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
    return sub ? sub.color : 'bg-slate-500';
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden relative">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 gap-4">
        <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <i className="fas fa-list-ul text-blue-500"></i>
                {t('messageLog.title')}
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-xs font-mono">{filteredMessages.length} <span className="text-slate-400 font-normal">/ {messages.length}</span></span>
            </h3>
            
            {/* Filter Input */}
            <div className="relative group">
                <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input 
                    type="text" 
                    placeholder={t('messageLog.filterPlaceholder')}
                    className="pl-7 pr-3 py-1 bg-white border border-slate-200 rounded-full text-xs w-32 focus:w-48 transition-all focus:ring-2 focus:ring-blue-100 outline-none"
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                />
                 {filterText && (
                    <button 
                        onClick={() => setFilterText('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        <i className="fas fa-times text-xs"></i>
                    </button>
                )}
            </div>
        </div>

        <div className="flex items-center gap-2">
            <button 
                onClick={() => setIsPaused(!isPaused)} 
                className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${isPaused ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'text-slate-500 hover:bg-slate-100'}`}
                title={isPaused ? t('messageLog.resumeAutoScroll') : t('messageLog.pauseAutoScroll')}
            >
                {isPaused ? <i className="fas fa-play"></i> : <i className="fas fa-pause"></i>}
                <span className="hidden sm:inline">{isPaused ? t('common.resume') : t('common.pause')}</span>
            </button>
            <div className="h-4 w-px bg-slate-200"></div>
            <button onClick={onClear} className="text-slate-400 hover:text-red-500 text-xs font-medium transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50">
                <i className="fas fa-trash-alt"></i> <span className="hidden sm:inline">{t('common.clear')}</span>
            </button>
            <button onClick={onExport} className="text-slate-400 hover:text-indigo-600 text-xs font-medium transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50">
                <i className="fas fa-file-export"></i> <span className="hidden sm:inline">{t('common.export')}</span>
            </button>
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={(event) => { void handleListScroll(event); }}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30 custom-scrollbar relative"
      >
        {(hasMoreOlder || isLoadingOlder) && (
          <div className="flex justify-center mb-2">
            <span className="text-[11px] text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
              {isLoadingOlder ? t('messageLog.loadingOlder') : t('messageLog.scrollTopToLoadOlder')}
            </span>
          </div>
        )}
        {filteredMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                <i className="fas fa-inbox text-4xl mb-2"></i>
                <p>{messages.length > 0 ? t('messageLog.allFilteredOrMuted') : t('messageLog.noMessages')}</p>
            </div>
        )}
        
        {filteredMessages.map((msg) => {
            const isOut = msg.direction === 'out';
            const badgeColor = isOut ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';
            const topicColor = !isOut ? getTopicColor(msg.topic).replace('bg-', 'text-') : 'text-slate-600';

            return (
                <div key={msg.id} className="flex gap-3 animate-in fade-in duration-200">
                    <div className="flex flex-col items-center pt-1 min-w-[65px]">
                        <span className="text-[10px] font-mono text-slate-400 tabular-nums">{formatTime(msg.timestamp)}</span>
                        <div className={`mt-1 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase border tracking-wider ${badgeColor}`}>
                            {t(`messageLog.direction.${msg.direction}`)}
                        </div>
                    </div>
                    
                    <div className={`flex-1 bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow ${isOut ? 'rounded-tl-none border-l-2 border-l-indigo-300' : 'rounded-tr-none border-r-2 border-r-emerald-300'}`}>
                        <div className="flex justify-between items-start mb-1.5">
                            <span className={`font-mono text-xs font-bold break-all ${topicColor} bg-slate-50 px-1 rounded`}>
                                {msg.topic}
                            </span>
                            <div className="flex gap-2 text-[10px] text-slate-400 font-mono">
                                <span className="bg-slate-100 px-1 rounded">QoS {msg.qos}</span>
                                {msg.retain && <span className="text-orange-600 bg-orange-50 px-1 rounded font-bold">{t('messageLog.retain')}</span>}
                            </div>
                        </div>
                        <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto custom-scrollbar bg-slate-50/50 p-2 rounded border border-slate-100">
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
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg cursor-pointer hover:bg-blue-700 animate-bounce z-10"
          >
              {t('messageLog.resumeAndShowNew')}
          </div>
      )}
    </div>
  );
};

export default MessageLog;
