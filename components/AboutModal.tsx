import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import foxEmblem from '../assets/fox-emblem.svg';
import { openExternalUrl } from '../services/externalLink';

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
  const authorHomeUrl = t('settingsModal.aboutValue.authorHomeUrl');
  const authorName = t('settingsModal.aboutValue.author');
  const wechatName = t('settingsModal.aboutValue.wechat');
  const wechatQrCodeUrl = t('settingsModal.aboutValue.wechatQrUrl');
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

  const copyText = async (key: 'author' | 'repo', text: string) => {
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

  const handleExternalLinkClick =
    (url: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void openExternalUrl(url);
    };

  const cardBaseClass = 'h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
  const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-slate-500';
  const secondaryActionClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-600';
  const getCopyActionClass = (key: 'author' | 'repo') =>
    `inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
      copiedKey === key
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
    }`;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-indigo-50 via-white to-cyan-50"></div>

        <div className="relative flex items-start justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600">
              <i className="fas fa-circle-info text-sm"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-800">{t('app.aboutModal.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('app.aboutModal.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
            aria-label={t('app.aboutModal.close')}
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="relative space-y-5 px-6 py-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="mx-auto flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-3 sm:mx-0">
                <img src={foxEmblem} alt={t('app.aboutModal.title')} className="h-16 w-16 object-contain" />
              </div>
              <div className="space-y-2 text-sm leading-relaxed text-slate-600">
                <p className={labelClass}>{t('settingsModal.aboutSection')}</p>
                <p>{t('app.aboutModal.tagline')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className={cardBaseClass}>
              <div className="mb-2 flex items-center gap-2">
                <i className="fas fa-user text-xs text-slate-400"></i>
                <p className={labelClass}>{t('settingsModal.authorLabel')}</p>
              </div>
              <div className="text-sm font-semibold text-slate-700 break-all">{authorName}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {authorUrl && (
                  <a
                    href={authorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleExternalLinkClick(authorUrl)}
                    className={secondaryActionClass}
                  >
                    <span>{t('app.aboutModal.openAuthor')}</span>
                    <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                  </a>
                )}
                {authorHomeUrl && (
                  <a
                    href={authorHomeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleExternalLinkClick(authorHomeUrl)}
                    className={secondaryActionClass}
                  >
                    <span>{t('app.aboutModal.openHome')}</span>
                    <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                  </a>
                )}
              </div>
            </div>

            <div className={cardBaseClass}>
              <div className="mb-2 flex items-center gap-2">
                <i className="fab fa-weixin text-sm text-emerald-500"></i>
                <p className={labelClass}>{t('settingsModal.wechatLabel')}</p>
              </div>
              <div className="text-sm font-semibold text-slate-700 break-all">{wechatName}</div>
              <div className="mt-4 flex justify-center">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    <img
                      src={wechatQrCodeUrl}
                      alt={`${wechatName} QR Code`}
                      className="h-24 w-24 rounded-md object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={cardBaseClass}>
              <div className="mb-2 flex items-center gap-2">
                <i className="fab fa-github text-sm text-slate-500"></i>
                <p className={labelClass}>{t('settingsModal.openSourceLabel')}</p>
              </div>
              <div className="text-sm font-medium text-indigo-600 break-all">{shortOpenSource}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void copyText('repo', openSourceUrl);
                  }}
                  className={getCopyActionClass('repo')}
                >
                  {copiedKey === 'repo' ? t('app.aboutModal.copied') : t('app.aboutModal.copyRepo')}
                </button>
                <a
                  href={openSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleExternalLinkClick(openSourceUrl)}
                  className={secondaryActionClass}
                >
                  <span>{t('app.aboutModal.openRepo')}</span>
                  <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800"
          >
            {t('app.aboutModal.close')}
          </button>
          <a
            href={openSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick(openSourceUrl)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
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
