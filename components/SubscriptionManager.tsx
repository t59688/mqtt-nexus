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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full flex flex-col">
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        <i className="fas fa-rss text-emerald-500"></i>
        {t('subscription.title')}
      </h3>

      <form onSubmit={handleSubscribe} className="mb-4 flex flex-wrap items-stretch gap-2">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t('subscription.topicFilterPlaceholder')}
          className="min-w-0 flex-[1_1_12rem] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 font-mono"
          disabled={!isConnected}
        />
        <select
          value={qos}
          onChange={(e) => setQos(Number(e.target.value) as 0|1|2)}
          className="w-20 flex-shrink-0 px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          disabled={!isConnected}
        >
            <option value="0">{t('subscription.qos0')}</option>
            <option value="1">{t('subscription.qos1')}</option>
            <option value="2">{t('subscription.qos2')}</option>
        </select>
        <button
          type="submit"
          disabled={!isConnected || !topic}
          className="flex-shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg transition-colors"
        >
          <i className="fas fa-plus"></i>
        </button>
      </form>

      <div className="flex-1 overflow-y-auto overflow-x-auto space-y-2 pr-1 custom-scrollbar">
        {subscriptions.length === 0 && (
            <div className="text-center text-slate-400 py-8 text-sm italic">
                {t('subscription.noActive')}
            </div>
        )}
        {subscriptions.map((sub) => (
          <div 
            key={sub.topic} 
            className={`flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 group transition-all duration-200 ${sub.muted ? 'opacity-60 grayscale bg-slate-100' : 'hover:border-emerald-200 hover:bg-white hover:shadow-sm'}`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
                <span className={`w-2.5 h-2.5 rounded-full ${sub.color} shadow-sm transition-transform ${sub.muted ? 'scale-75' : 'scale-100'}`}></span>
                <div className="flex flex-col min-w-0">
                    <span className={`font-mono text-xs font-bold truncate transition-colors ${sub.muted ? 'text-slate-500 line-through decoration-slate-400' : 'text-slate-700'}`}>
                        {sub.topic}
                    </span>
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">QoS {sub.qos}</span>
                </div>
            </div>
            
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onToggleMute(sub.topic)}
                    className={`p-1.5 rounded-md transition-colors ${sub.muted ? 'text-slate-400 hover:text-indigo-600' : 'text-slate-300 hover:text-indigo-600'}`}
                    title={sub.muted ? t('subscription.unmute') : t('subscription.mute')}
                >
                    <i className={`fas ${sub.muted ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
                <button
                    onClick={() => onUnsubscribe(sub.topic)}
                    className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
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
