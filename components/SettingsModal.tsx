import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BrokerConfig, AuthIdentity, AiConfig, AiPromptsConfig } from '../types';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { DEFAULT_AI_PROMPTS, DEFAULT_BROKER, DEFAULT_IDENTITY } from '../constants';
import foxEmblem from '../assets/fox-emblem.svg';
import { openExternalUrl } from '../services/externalLink';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'ai' | 'prompts' | 'brokers' | 'identities';

  brokers: BrokerConfig[];
  identities: AuthIdentity[];
  onSaveBroker: (broker: BrokerConfig) => void;
  onDeleteBroker: (id: string) => void;
  onSaveIdentity: (identity: AuthIdentity) => void;
  onDeleteIdentity: (id: string) => void;

  language: SupportedLanguage;
  theme: 'light' | 'dark';
  aiConfig: AiConfig;
  aiPrompts: AiPromptsConfig;
  configFilePath?: string;
  onLanguageChange: (language: SupportedLanguage) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onOpenConfigDir: () => void;
  onCopyConfigPath: () => void;
  onImportConfig: () => void;
  onExportConfig: () => void;
  onAiConfigChange: (config: AiConfig) => void;
  onAiPromptsChange: (config: AiPromptsConfig) => void;
}

type PromptEditorTab = 'payload' | 'topicCatalog';
type PromptNoticeTone = 'success' | 'error' | 'info';

interface PromptToolNotice {
  message: string;
  tone: PromptNoticeTone;
}

interface PromptTemplateFile {
  magic?: string;
  version?: string;
  prompts?: unknown;
}

const PROMPTS_TEMPLATE_MAGIC = 'MQTT_NEXUS_AI_PROMPTS_TEMPLATE_V1';
const PROMPTS_TEMPLATE_VERSION = '1.0';

const getBrokerProtocolDefaults = (protocol: BrokerConfig['protocol']) => ({
  port: protocol === 'mqtt' ? 1883 : protocol === 'mqtts' ? 8883 : protocol === 'ws' ? 8083 : 8084,
  path: protocol === 'ws' || protocol === 'wss' ? '/mqtt' : '',
  ssl: protocol === 'mqtts' || protocol === 'wss',
});

const normalizePromptConfig = (value: unknown): AiPromptsConfig => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AI_PROMPTS };
  }

  const raw = value as Partial<AiPromptsConfig>;
  return {
    payloadSystemPrompt:
      typeof raw.payloadSystemPrompt === 'string' ? raw.payloadSystemPrompt : DEFAULT_AI_PROMPTS.payloadSystemPrompt,
    payloadUserPromptTemplate:
      typeof raw.payloadUserPromptTemplate === 'string'
        ? raw.payloadUserPromptTemplate
        : DEFAULT_AI_PROMPTS.payloadUserPromptTemplate,
    payloadDescriptionFallback:
      typeof raw.payloadDescriptionFallback === 'string'
        ? raw.payloadDescriptionFallback
        : DEFAULT_AI_PROMPTS.payloadDescriptionFallback,
    topicCatalogSystemPrompt:
      typeof raw.topicCatalogSystemPrompt === 'string'
        ? raw.topicCatalogSystemPrompt
        : DEFAULT_AI_PROMPTS.topicCatalogSystemPrompt,
    topicCatalogUserPromptTemplate:
      typeof raw.topicCatalogUserPromptTemplate === 'string'
        ? raw.topicCatalogUserPromptTemplate
        : DEFAULT_AI_PROMPTS.topicCatalogUserPromptTemplate,
  };
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'general',
  brokers,
  identities,
  onSaveBroker,
  onDeleteBroker,
  onSaveIdentity,
  onDeleteIdentity,
  language,
  theme,
  aiConfig,
  aiPrompts,
  configFilePath,
  onLanguageChange,
  onThemeChange,
  onOpenConfigDir,
  onCopyConfigPath,
  onImportConfig,
  onExportConfig,
  onAiConfigChange,
  onAiPromptsChange,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'prompts' | 'brokers' | 'identities'>('general');
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const [editingBroker, setEditingBroker] = useState<BrokerConfig>(DEFAULT_BROKER);
  const [editingIdentity, setEditingIdentity] = useState<AuthIdentity>(DEFAULT_IDENTITY);
  const [isEditingBroker, setIsEditingBroker] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [promptEditorTab, setPromptEditorTab] = useState<PromptEditorTab>('payload');
  const [promptToolNotice, setPromptToolNotice] = useState<PromptToolNotice | null>(null);
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const promptNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setIsEditingBroker(false);
      setIsEditingIdentity(false);
      setPromptEditorTab('payload');
      setPromptToolNotice(null);
      setCopiedKey(null);
    }
  }, [isOpen, initialTab]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
      if (promptNoticeTimerRef.current) {
        window.clearTimeout(promptNoticeTimerRef.current);
      }
    },
    []
  );

  const handleBrokerSave = () => {
    if (!editingBroker.name) {
      return;
    }

    const normalizedProtocol = editingBroker.protocol;
    const normalizedPath = normalizedProtocol === 'ws' || normalizedProtocol === 'wss'
      ? editingBroker.path || '/mqtt'
      : '';

    const toSave: BrokerConfig = {
      ...editingBroker,
      id: editingBroker.id || crypto.randomUUID(),
      path: normalizedPath,
      ssl: normalizedProtocol === 'mqtts' || normalizedProtocol === 'wss',
    };

    onSaveBroker(toSave);
    setIsEditingBroker(false);
  };

  const handleIdentitySave = () => {
    if (!editingIdentity.name) {
      return;
    }
    const toSave = { ...editingIdentity, id: editingIdentity.id || crypto.randomUUID() };
    onSaveIdentity(toSave);
    setIsEditingIdentity(false);
  };

  const handleExternalLinkClick =
    (url: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void openExternalUrl(url);
    };

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

  const showPromptNotice = (message: string, tone: PromptNoticeTone = 'info') => {
    setPromptToolNotice({ message, tone });
    if (promptNoticeTimerRef.current) {
      window.clearTimeout(promptNoticeTimerRef.current);
    }
    promptNoticeTimerRef.current = window.setTimeout(() => {
      setPromptToolNotice(null);
      promptNoticeTimerRef.current = null;
    }, 3000);
  };

  const triggerPromptTemplateImport = () => {
    promptFileInputRef.current?.click();
  };

  const handlePromptTemplateImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void (async () => {
      try {
        const content = await file.text();
        const parsed = JSON.parse(content) as PromptTemplateFile | AiPromptsConfig;
        const hasWrapper = parsed && typeof parsed === 'object' && 'prompts' in parsed;
        if (
          hasWrapper &&
          typeof (parsed as PromptTemplateFile).magic === 'string' &&
          (parsed as PromptTemplateFile).magic !== PROMPTS_TEMPLATE_MAGIC
        ) {
          throw new Error('invalid_magic');
        }

        const candidate = hasWrapper ? (parsed as PromptTemplateFile).prompts : parsed;
        const normalized = normalizePromptConfig(candidate);
        onAiPromptsChange(normalized);
        showPromptNotice(t('settingsModal.promptTemplateImportSuccess'), 'success');
      } catch (error) {
        const reason = error instanceof Error ? error.message : '';
        if (reason === 'invalid_magic') {
          showPromptNotice(t('settingsModal.promptTemplateInvalidMagic'), 'error');
        } else {
          showPromptNotice(t('settingsModal.promptTemplateImportFailed'), 'error');
        }
      } finally {
        if (promptFileInputRef.current) {
          promptFileInputRef.current.value = '';
        }
      }
    })();
  };

  const handlePromptTemplateExport = () => {
    const payload = {
      magic: PROMPTS_TEMPLATE_MAGIC,
      version: PROMPTS_TEMPLATE_VERSION,
      exportedAt: Date.now(),
      prompts: aiPrompts,
    };
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mqtt-nexus-ai-prompts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showPromptNotice(t('settingsModal.promptTemplateExported'), 'success');
  };

  if (!isOpen) {
    return null;
  }

  const isWsProtocol = editingBroker.protocol === 'ws' || editingBroker.protocol === 'wss';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col h-[80vh]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 pt-4 pb-0">
          <div className="flex gap-6 flex-wrap">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fas fa-sliders mr-2"></i> {t('settingsModal.tabGeneral')}
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ai' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fas fa-robot mr-2"></i> {t('settingsModal.tabAi')}
            </button>
            <button
              onClick={() => setActiveTab('prompts')}
              className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'prompts' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fas fa-quote-right mr-2"></i> {t('settingsModal.tabPrompts')}
            </button>
            <button
              onClick={() => setActiveTab('brokers')}
              className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'brokers' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fas fa-server mr-2"></i> {t('settingsModal.tabBrokers')}
            </button>
            <button
              onClick={() => setActiveTab('identities')}
              className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'identities' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fas fa-id-card mr-2"></i> {t('settingsModal.tabIdentities')}
            </button>
          </div>
          <button onClick={onClose} className="mb-4 text-slate-400 hover:text-slate-600">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-white relative">
          {activeTab === 'general' && (
            <div className="h-full p-6 overflow-y-auto custom-scrollbar">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{t('settingsModal.generalTitle')}</h3>
                  <p className="text-xs text-slate-500">{t('settingsModal.generalDescription')}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t('settingsModal.interfaceSection')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('common.language')}</label>
                      <select
                        value={language}
                        onChange={(event) => onLanguageChange(event.target.value as SupportedLanguage)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {t(`app.languageOptions.${lang}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('common.theme')}</label>
                      <select
                        value={theme}
                        onChange={(event) => onThemeChange(event.target.value as 'light' | 'dark')}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="light">{t('app.themeOptions.light')}</option>
                        <option value="dark">{t('app.themeOptions.dark')}</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t('settingsModal.storageSection')}</h4>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{t('app.configFilePath')}</label>
                  <div className="font-mono text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 break-all">
                    {configFilePath || t('app.pathUnavailable')}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={onOpenConfigDir}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      <i className="fas fa-folder-open mr-2"></i>{t('app.openConfigDir')}
                    </button>
                    <button
                      onClick={onCopyConfigPath}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors"
                    >
                      <i className="fas fa-copy mr-2"></i>{t('common.copy')}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">{t('settingsModal.backupSection')}</h4>
                  <p className="text-xs text-slate-500 mb-4">{t('settingsModal.backupDescription')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onImportConfig}
                      className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors"
                    >
                      <i className="fas fa-file-import mr-2"></i>{t('common.import')}
                    </button>
                    <button
                      onClick={onExportConfig}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors"
                    >
                      <i className="fas fa-file-export mr-2"></i>{t('common.export')}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">{t('settingsModal.aboutSection')}</h4>
                  <p className="text-xs text-slate-500 mb-4">{t('settingsModal.aboutDescription')}</p>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-3 sm:mx-0">
                          <img src={foxEmblem} alt={t('settingsModal.aboutSection')} className="h-14 w-14 object-contain" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('settingsModal.aboutSection')}</p>
                          <p className="text-sm text-slate-600 leading-relaxed">{t('app.aboutModal.tagline')}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
                      <div className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center gap-2">
                          <i className="fas fa-user text-xs text-slate-400"></i>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('settingsModal.authorLabel')}</p>
                        </div>
                        <div className="text-sm font-semibold text-slate-700 break-all">{authorName}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {authorUrl && (
                            <a
                              href={authorUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={handleExternalLinkClick(authorUrl)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-600"
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
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-600"
                            >
                              <span>{t('app.aboutModal.openHome')}</span>
                              <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center gap-2">
                          <i className="fab fa-weixin text-sm text-emerald-500"></i>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('settingsModal.wechatLabel')}</p>
                        </div>
                        <div className="text-sm font-semibold text-slate-700 break-all">{wechatName}</div>
                        <div className="mt-3 flex justify-center">
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

                      <div className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center gap-2">
                          <i className="fab fa-github text-sm text-slate-500"></i>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('settingsModal.openSourceLabel')}</p>
                        </div>
                        <div className="text-sm font-medium text-indigo-600 break-all">{shortOpenSource}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              void copyText('repo', openSourceUrl);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              copiedKey === 'repo'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
                            }`}
                          >
                            {copiedKey === 'repo' ? t('app.aboutModal.copied') : t('app.aboutModal.copyRepo')}
                          </button>
                          <a
                            href={openSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleExternalLinkClick(openSourceUrl)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-600"
                          >
                            <span>{t('app.aboutModal.openRepo')}</span>
                            <i className="fas fa-arrow-up-right-from-square text-[10px]"></i>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="h-full p-6 overflow-y-auto custom-scrollbar">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{t('settingsModal.aiTitle')}</h3>
                  <p className="text-xs text-slate-500">{t('settingsModal.aiDescription')}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t('settingsModal.aiConnectionSection')}</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.aiBaseUrl')}
                      </label>
                      <input
                        type="text"
                        value={aiConfig.baseUrl || ''}
                        onChange={(event) =>
                          onAiConfigChange({
                            ...aiConfig,
                            baseUrl: event.target.value,
                          })
                        }
                        placeholder={t('settingsModal.aiBaseUrlPlaceholder')}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.aiApiKey')}
                      </label>
                      <input
                        type="password"
                        value={aiConfig.apiKey || ''}
                        onChange={(event) =>
                          onAiConfigChange({
                            ...aiConfig,
                            apiKey: event.target.value,
                          })
                        }
                        placeholder={t('settingsModal.aiApiKeyPlaceholder')}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.aiModel')}
                      </label>
                      <input
                        type="text"
                        value={aiConfig.model || ''}
                        onChange={(event) =>
                          onAiConfigChange({
                            ...aiConfig,
                            model: event.target.value,
                          })
                        }
                        placeholder={t('settingsModal.aiModelPlaceholder')}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
                  <i className="fas fa-circle-info mr-2"></i>
                  {t('settingsModal.aiTip')}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'prompts' && (
            <div className="h-full p-6 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{t('settingsModal.promptsTitle')}</h3>
                  <p className="text-xs text-slate-500">{t('settingsModal.promptsDescription')}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                      <button
                        onClick={() => setPromptEditorTab('payload')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          promptEditorTab === 'payload'
                            ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t('settingsModal.promptPayloadSection')}
                      </button>
                      <button
                        onClick={() => setPromptEditorTab('topicCatalog')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          promptEditorTab === 'topicCatalog'
                            ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t('settingsModal.promptTopicCatalogSection')}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={promptFileInputRef}
                        type="file"
                        className="hidden"
                        accept=".json,application/json"
                        onChange={handlePromptTemplateImport}
                      />
                      <button
                        onClick={triggerPromptTemplateImport}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                      >
                        <i className="fas fa-file-import mr-1"></i>
                        {t('settingsModal.promptTemplateImport')}
                      </button>
                      <button
                        onClick={handlePromptTemplateExport}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                      >
                        <i className="fas fa-file-export mr-1"></i>
                        {t('settingsModal.promptTemplateExport')}
                      </button>
                    </div>
                  </div>
                  {promptToolNotice && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        promptToolNotice.tone === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : promptToolNotice.tone === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {promptToolNotice.message}
                    </div>
                  )}
                </div>

                {promptEditorTab === 'payload' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                        {t('settingsModal.promptPayloadSection')}
                      </h4>
                      <button
                        onClick={() =>
                          onAiPromptsChange({
                            ...aiPrompts,
                            payloadSystemPrompt: DEFAULT_AI_PROMPTS.payloadSystemPrompt,
                            payloadUserPromptTemplate: DEFAULT_AI_PROMPTS.payloadUserPromptTemplate,
                            payloadDescriptionFallback: DEFAULT_AI_PROMPTS.payloadDescriptionFallback,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                      >
                        {t('settingsModal.promptResetDefaults')}
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.promptSystemLabel')}
                      </label>
                      <textarea
                        value={aiPrompts.payloadSystemPrompt}
                        onChange={(event) =>
                          onAiPromptsChange({ ...aiPrompts, payloadSystemPrompt: event.target.value })
                        }
                        rows={3}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.promptUserTemplateLabel')}
                      </label>
                      <textarea
                        value={aiPrompts.payloadUserPromptTemplate}
                        onChange={(event) =>
                          onAiPromptsChange({
                            ...aiPrompts,
                            payloadUserPromptTemplate: event.target.value,
                          })
                        }
                        rows={6}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        {t('settingsModal.promptTemplateHintPayload')}
                        <span className="ml-1 font-mono text-slate-600">{'{{topic}}'}</span>
                        <span className="mx-1 text-slate-400">/</span>
                        <span className="font-mono text-slate-600">{'{{description}}'}</span>
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.promptDescriptionFallbackLabel')}
                      </label>
                      <textarea
                        value={aiPrompts.payloadDescriptionFallback}
                        onChange={(event) =>
                          onAiPromptsChange({
                            ...aiPrompts,
                            payloadDescriptionFallback: event.target.value,
                          })
                        }
                        rows={3}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {promptEditorTab === 'topicCatalog' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                        {t('settingsModal.promptTopicCatalogSection')}
                      </h4>
                      <button
                        onClick={() =>
                          onAiPromptsChange({
                            ...aiPrompts,
                            topicCatalogSystemPrompt: DEFAULT_AI_PROMPTS.topicCatalogSystemPrompt,
                            topicCatalogUserPromptTemplate:
                              DEFAULT_AI_PROMPTS.topicCatalogUserPromptTemplate,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                      >
                        {t('settingsModal.promptResetDefaults')}
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.promptSystemLabel')}
                      </label>
                      <textarea
                        value={aiPrompts.topicCatalogSystemPrompt}
                        onChange={(event) =>
                          onAiPromptsChange({
                            ...aiPrompts,
                            topicCatalogSystemPrompt: event.target.value,
                          })
                        }
                        rows={3}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        {t('settingsModal.promptUserTemplateLabel')}
                      </label>
                      <textarea
                        value={aiPrompts.topicCatalogUserPromptTemplate}
                        onChange={(event) =>
                          onAiPromptsChange({
                            ...aiPrompts,
                            topicCatalogUserPromptTemplate: event.target.value,
                          })
                        }
                        rows={12}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        {t('settingsModal.promptTemplateHintCatalog')}
                        <span className="ml-1 font-mono text-slate-600">{'{{responseLanguage}}'}</span>
                        <span className="mx-1 text-slate-400">/</span>
                        <span className="font-mono text-slate-600">{'{{sourceName}}'}</span>
                        <span className="mx-1 text-slate-400">/</span>
                        <span className="font-mono text-slate-600">{'{{sourceText}}'}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'brokers' && (
            <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
              {!isEditingBroker ? (
                <div className="h-full flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-700">{t('settingsModal.managedBrokers')}</h3>
                      <p className="text-xs text-slate-500">{t('settingsModal.managedBrokersDesc')}</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingBroker({ ...DEFAULT_BROKER, id: '' });
                        setIsEditingBroker(true);
                      }}
                      className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 shadow-lg shadow-slate-200"
                    >
                      <i className="fas fa-plus mr-2"></i> {t('settingsModal.newBroker')}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {brokers.map((b) => (
                      <div key={b.id} className="flex flex-col p-4 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-slate-800 flex items-center gap-2">
                            <i className="fas fa-network-wired text-slate-400 text-xs"></i>
                            {b.name}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingBroker(b); setIsEditingBroker(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                              <i className="fas fa-edit"></i>
                            </button>
                            <button onClick={() => onDeleteBroker(b.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 font-mono bg-white p-2 rounded border border-slate-100">
                          {b.protocol}://{b.host}:{b.port}{b.path || ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  {brokers.length === 0 && <div className="flex-1 flex items-center justify-center text-slate-400 italic">{t('settingsModal.noBrokers')}</div>}
                </div>
              ) : (
                <div className="max-w-xl mx-auto w-full py-4 animate-in slide-in-from-right-4">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <button onClick={() => setIsEditingBroker(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-arrow-left"></i></button>
                    {editingBroker.id ? t('settingsModal.editBroker') : t('settingsModal.newBroker')}
                  </h3>
                  <div className="space-y-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <div>
                      <label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.displayName')}</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        value={editingBroker.name}
                        onChange={(e) => setEditingBroker((b) => ({ ...b, name: e.target.value }))}
                        placeholder={t('settingsModal.placeholders.productionCluster')}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.hostAddress')}</label>
                        <input
                          type="text"
                          className="w-full border border-slate-300 p-2 rounded-lg"
                          value={editingBroker.host}
                          onChange={(e) => setEditingBroker((b) => ({ ...b, host: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.port')}</label>
                        <input
                          type="number"
                          className="w-full border border-slate-300 p-2 rounded-lg"
                          value={editingBroker.port}
                          onChange={(e) => setEditingBroker((b) => ({ ...b, port: parseInt(e.target.value, 10) || 0 }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.protocol')}</label>
                        <select
                          className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                          value={editingBroker.protocol}
                          onChange={(e) => {
                            const protocol = e.target.value as BrokerConfig['protocol'];
                            const defaults = getBrokerProtocolDefaults(protocol);
                            setEditingBroker((b) => ({
                              ...b,
                              protocol,
                              port: defaults.port,
                              path: defaults.path,
                              ssl: defaults.ssl,
                            }));
                          }}
                        >
                          <option value="mqtt">mqtt://</option>
                          <option value="mqtts">mqtts://</option>
                          <option value="ws">ws://</option>
                          <option value="wss">wss://</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.mountPath')}</label>
                        <input
                          type="text"
                          className="w-full border border-slate-300 p-2 rounded-lg"
                          value={editingBroker.path || ''}
                          onChange={(e) => setEditingBroker((b) => ({ ...b, path: e.target.value }))}
                          disabled={!isWsProtocol}
                          placeholder={isWsProtocol ? t('settingsModal.placeholders.wsMountPath') : t('settingsModal.placeholders.tcpMountPath')}
                        />
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 mt-4">
                      <button onClick={() => setIsEditingBroker(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg">{t('common.cancel')}</button>
                      <button onClick={handleBrokerSave} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md">{t('settingsModal.saveBroker')}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'identities' && (
            <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
              {!isEditingIdentity ? (
                <div className="h-full flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-700">{t('settingsModal.managedIdentities')}</h3>
                      <p className="text-xs text-slate-500">{t('settingsModal.managedIdentitiesDesc')}</p>
                    </div>
                    <button onClick={() => { setEditingIdentity({ ...DEFAULT_IDENTITY, id: '' }); setIsEditingIdentity(true); }} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 shadow-lg shadow-slate-200"><i className="fas fa-plus mr-2"></i> {t('settingsModal.newIdentity')}</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {identities.map((i) => (
                      <div key={i.id} className="flex flex-col p-4 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-slate-800 flex items-center gap-2">
                            <i className="fas fa-user-shield text-slate-400 text-xs"></i>
                            {i.name}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingIdentity(i); setIsEditingIdentity(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><i className="fas fa-edit"></i></button>
                            <button onClick={() => onDeleteIdentity(i.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><i className="fas fa-trash"></i></button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-slate-500 flex justify-between bg-white p-1.5 rounded border border-slate-100">
                            <span className="font-bold">{t('common.user')}:</span> <span className="font-mono">{i.username || t('settingsModal.placeholders.none')}</span>
                          </div>
                          <div className="text-xs text-slate-500 flex justify-between bg-white p-1.5 rounded border border-slate-100">
                            <span className="font-bold">{t('common.clientId')}:</span> <span className="font-mono">{i.clientId || t('settingsModal.placeholders.auto')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {identities.length === 0 && <div className="flex-1 flex items-center justify-center text-slate-400 italic">{t('settingsModal.noIdentities')}</div>}
                </div>
              ) : (
                <div className="max-w-xl mx-auto w-full py-4 animate-in slide-in-from-right-4">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <button onClick={() => setIsEditingIdentity(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-arrow-left"></i></button>
                    {editingIdentity.id ? t('settingsModal.editIdentity') : t('settingsModal.newIdentity')}
                  </h3>
                  <div className="space-y-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <div><label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.identityName')}</label><input type="text" className="w-full border border-slate-300 p-2 rounded-lg" value={editingIdentity.name} onChange={(e) => setEditingIdentity((i) => ({ ...i, name: e.target.value }))} placeholder={t('settingsModal.placeholders.adminUser')} /></div>
                    <div><label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.username')}</label><input type="text" className="w-full border border-slate-300 p-2 rounded-lg" value={editingIdentity.username || ''} onChange={(e) => setEditingIdentity((i) => ({ ...i, username: e.target.value }))} /></div>
                    <div><label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.password')}</label><input type="text" className="w-full border border-slate-300 p-2 rounded-lg" value={editingIdentity.password || ''} onChange={(e) => setEditingIdentity((i) => ({ ...i, password: e.target.value }))} /></div>
                    <div><label className="text-sm font-bold text-slate-600 block mb-1">{t('settingsModal.staticClientId')}</label><input type="text" className="w-full border border-slate-300 p-2 rounded-lg font-mono text-sm" value={editingIdentity.clientId || ''} onChange={(e) => setEditingIdentity((i) => ({ ...i, clientId: e.target.value }))} placeholder={t('settingsModal.placeholders.staticClientId')} /></div>

                    <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 mt-4">
                      <button onClick={() => setIsEditingIdentity(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg">{t('common.cancel')}</button>
                      <button onClick={handleIdentitySave} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md">{t('settingsModal.saveIdentity')}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
