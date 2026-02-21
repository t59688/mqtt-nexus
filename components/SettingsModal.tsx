import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrokerConfig, AuthIdentity } from '../types';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { DEFAULT_BROKER, DEFAULT_IDENTITY } from '../constants';
import foxEmblem from '../assets/fox-emblem.svg';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'brokers' | 'identities';

  brokers: BrokerConfig[];
  identities: AuthIdentity[];
  onSaveBroker: (broker: BrokerConfig) => void;
  onDeleteBroker: (id: string) => void;
  onSaveIdentity: (identity: AuthIdentity) => void;
  onDeleteIdentity: (id: string) => void;

  language: SupportedLanguage;
  theme: 'light' | 'dark';
  configFilePath?: string;
  onLanguageChange: (language: SupportedLanguage) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onOpenConfigDir: () => void;
  onCopyConfigPath: () => void;
  onImportConfig: () => void;
  onExportConfig: () => void;
}

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
  configFilePath,
  onLanguageChange,
  onThemeChange,
  onOpenConfigDir,
  onCopyConfigPath,
  onImportConfig,
  onExportConfig,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'brokers' | 'identities'>('general');
  const openSourceUrl = t('settingsModal.aboutValue.openSourceUrl');

  const [editingBroker, setEditingBroker] = useState<BrokerConfig>(DEFAULT_BROKER);
  const [editingIdentity, setEditingIdentity] = useState<AuthIdentity>(DEFAULT_IDENTITY);
  const [isEditingBroker, setIsEditingBroker] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setIsEditingBroker(false);
      setIsEditingIdentity(false);
    }
  }, [isOpen, initialTab]);

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

  if (!isOpen) {
    return null;
  }

  const isWsProtocol = editingBroker.protocol === 'ws' || editingBroker.protocol === 'wss';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col h-[80vh]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 pt-4 pb-0">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fas fa-sliders mr-2"></i> {t('settingsModal.tabGeneral')}
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
                  <div className="mb-4 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <img src={foxEmblem} alt={t('settingsModal.aboutSection')} className="h-20 w-20 object-contain" />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">{t('settingsModal.authorLabel')}</span>
                      <span className="font-semibold text-slate-700">{t('settingsModal.aboutValue.author')}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">{t('settingsModal.wechatLabel')}</span>
                      <span className="font-mono text-slate-700">{t('settingsModal.aboutValue.wechat')}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">{t('settingsModal.openSourceLabel')}</span>
                      <a
                        href={openSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        <span className="hidden sm:inline">{openSourceUrl}</span>
                        <span>{t('settingsModal.openSourceAction')}</span>
                        <i className="fas fa-arrow-up-right-from-square text-xs"></i>
                      </a>
                    </div>
                  </div>
                </div>
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
                            const port = protocol === 'mqtt' ? 1883 : protocol === 'mqtts' ? 8883 : protocol === 'ws' ? 8083 : 8084;
                            setEditingBroker((b) => ({
                              ...b,
                              protocol,
                              port: b.port || port,
                              path: protocol === 'ws' || protocol === 'wss' ? b.path || '/mqtt' : '',
                              ssl: protocol === 'mqtts' || protocol === 'wss',
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
