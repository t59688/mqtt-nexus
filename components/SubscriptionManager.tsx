import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Subscription } from '../types';
import { getRandomColor } from '../constants';

interface SubscriptionManagerProps {
  subscriptions: Subscription[];
  onSubscribe: (topic: string, qos: 0 | 1 | 2, color: string) => void;
  onUnsubscribe: (topic: string) => void;
  onToggleMute: (topic: string) => void;
  isConnected: boolean;
}

const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ subscriptions, onSubscribe, onUnsubscribe, onToggleMute, isConnected }) => {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('#');
  const [qos, setQos] = useState<0 | 1 | 2>(0);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    onSubscribe(topic, qos, getRandomColor());
    setTopic('');
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm dark:shadow-black/20 border border-zinc-200 dark:border-zinc-700 p-4 h-full flex flex-col">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-100 mb-3 flex items-center gap-2">
        <i className="fas fa-rss text-emerald-500"></i>
        {t('subscription.title')}
      </h3>

      <form onSubmit={handleSubscribe} className="mb-4 flex flex-wrap items-stretch gap-2">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t('subscription.topicFilterPlaceholder')}
          className="min-w-0 flex-[1_1_12rem] px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 font-mono bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          disabled={!isConnected}
        />
        <select
          value={qos}
          onChange={(e) => setQos(Number(e.target.value) as 0 | 1 | 2)}
          className="w-20 flex-shrink-0 px-2 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          disabled={!isConnected}
        >
          <option value="0">{t('subscription.qos0')}</option>
          <option value="1">{t('subscription.qos1')}</option>
          <option value="2">{t('subscription.qos2')}</option>
        </select>
        <button
          type="submit"
          disabled={!isConnected || !topic}
          className="flex-shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-lg transition-colors"
        >
          <i className="fas fa-plus"></i>
        </button>
      </form>

      <div className="flex-1 overflow-y-auto overflow-x-auto space-y-2 pr-1 custom-scrollbar">
        {subscriptions.length === 0 && (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-8 text-sm italic">
            {t('subscription.noActive')}
          </div>
        )}
        {subscriptions.map((sub) => (
          <div
            key={sub.topic}
            className={`flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-700 group transition-all duration-200 ${sub.muted ? 'opacity-60 grayscale bg-zinc-100 dark:bg-zinc-800' : 'hover:border-emerald-200 dark:hover:border-emerald-500/50 hover:bg-white dark:hover:bg-zinc-800 hover:shadow-sm dark:hover:shadow-black/20'}`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <span className={`w-2.5 h-2.5 rounded-full ${sub.color} shadow-sm transition-transform ${sub.muted ? 'scale-75' : 'scale-100'}`}></span>
              <div className="flex flex-col min-w-0">
                <span className={`font-mono text-xs font-bold truncate transition-colors ${sub.muted ? 'text-zinc-500 dark:text-zinc-400 line-through decoration-zinc-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                  {sub.topic}
                </span>
                <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider">QoS {sub.qos}</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onToggleMute(sub.topic)}
                className={`p-1.5 rounded-md transition-colors ${sub.muted ? 'text-zinc-400 hover:text-indigo-600' : 'text-zinc-300 hover:text-indigo-600'}`}
                title={sub.muted ? t('subscription.unmute') : t('subscription.mute')}
              >
                <i className={`fas ${sub.muted ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
              <button
                onClick={() => onUnsubscribe(sub.topic)}
                className="p-1.5 rounded-md text-zinc-300 hover:text-red-500 dark:hover:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-500/15 transition-colors"
                title={t('subscription.unsubscribe')}
              >
                <i className="fas fa-trash-alt text-xs"></i>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionManager;
