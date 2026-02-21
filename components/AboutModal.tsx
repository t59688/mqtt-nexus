import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import foxEmblem from '../assets/fox-emblem.svg';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const openSourceUrl = t('settingsModal.aboutValue.openSourceUrl');
  const authorUrl = t('settingsModal.aboutValue.authorUrl');
  const authorName = t('settingsModal.aboutValue.author');
  const wechatName = t('settingsModal.aboutValue.wechat');
  const wechatSearchUrl = useMemo(
    () => `https://weixin.sogou.com/weixin?type=1&query=${encodeURIComponent(wechatName)}`,
    [wechatName]
  );
  const shortOpenSource = useMemo(() => {
    try {
      const parsed = new URL(openSourceUrl);
      return parsed.host + parsed.pathname;
    } catch {
      return openSourceUrl;
    }
  }, [openSourceUrl]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    []
  );

  if (!isOpen) {
    return null;
  }

  const copyText = async (key: 'author' | 'wechat' | 'repo', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      setCopiedKey(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute -top-20 -left-16 h-52 w-52 rounded-full bg-indigo-100/70 blur-3xl"></div>
        <div className="absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-cyan-100/60 blur-3xl"></div>

        <div className="relative px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">{t('app.aboutModal.title')}</h3>
            <p className="text-sm text-slate-500 mt-1">{t('app.aboutModal.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={t('app.aboutModal.close')}
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="relative px-6 py-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="mb-3 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
              <img src={foxEmblem} alt={t('app.aboutModal.title')} className="h-20 w-20 object-contain" />
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{t('app.aboutModal.tagline')}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">{t('settingsModal.authorLabel')}</div>
              <div className="text-sm font-semibold text-slate-700 break-all">{authorName}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void copyText('author', authorName);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    copiedKey === 'author'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {copiedKey === 'author' ? t('app.aboutModal.copied') : t('app.aboutModal.copyAuthor')}
                </button>
                {authorUrl && (
                  <a
                    href={authorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded text-[11px] font-semibold border bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 inline-flex items-center gap-1"
                  >
                    <span>{t('app.aboutModal.openAuthor')}</span>
                    <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">{t('settingsModal.wechatLabel')}</div>
              <div className="text-sm font-mono text-slate-700 break-all">{wechatName}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void copyText('wechat', wechatName);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    copiedKey === 'wechat'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {copiedKey === 'wechat' ? t('app.aboutModal.copied') : t('app.aboutModal.copyWechat')}
                </button>
                <a
                  href={wechatSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded text-[11px] font-semibold border bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 inline-flex items-center gap-1"
                >
                  <span>{t('app.aboutModal.openWechat')}</span>
                  <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">{t('settingsModal.openSourceLabel')}</div>
              <div className="text-sm font-medium text-indigo-600 break-all">{shortOpenSource}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void copyText('repo', openSourceUrl);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    copiedKey === 'repo'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {copiedKey === 'repo' ? t('app.aboutModal.copied') : t('app.aboutModal.copyRepo')}
                </button>
                <a
                  href={openSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded text-[11px] font-semibold border bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 inline-flex items-center gap-1"
                >
                  <span>{t('app.aboutModal.openRepo')}</span>
                  <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="relative px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-600 hover:text-slate-800 hover:border-slate-400 transition-colors text-sm font-medium"
          >
            {t('app.aboutModal.close')}
          </button>
          <a
            href={openSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-semibold inline-flex items-center gap-2"
          >
            <i className="fab fa-github"></i>
            {t('app.aboutModal.openRepo')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
