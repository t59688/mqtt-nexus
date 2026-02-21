import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionProfile, BrokerConfig, AuthIdentity } from '../types';
import { DEFAULT_PROFILE, TAG_COLORS } from '../constants';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: ConnectionProfile) => void;
  initialProfile?: ConnectionProfile;
  existingGroups: string[];

  brokers: BrokerConfig[];
  identities: AuthIdentity[];

  onOpenSettings: (tab: 'brokers' | 'identities') => void;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  existingGroups,
  brokers,
  identities,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ConnectionProfile>(DEFAULT_PROFILE);
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (initialProfile) {
      setProfile({
        ...initialProfile,
        protocolVersion: initialProfile.protocolVersion ?? 4,
        path: initialProfile.path ?? '/mqtt',
      });
      return;
    }

    setProfile({
      ...DEFAULT_PROFILE,
      id: crypto.randomUUID(),
      name: t('connectionModal.defaults.newConnectionName'),
      group: t('connectionModal.defaults.defaultGroup'),
      clientId: `nexus-${Math.random().toString(16).substring(2, 8)}`,
      protocolVersion: 4,
    });
  }, [isOpen, initialProfile]);

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setProfile((prev) => {
      if (type === 'checkbox') {
        return { ...prev, [name]: checked };
      }

      if (name === 'port') {
        return { ...prev, port: Number(value) };
      }

      if (name === 'protocolVersion') {
        return { ...prev, protocolVersion: Number(value) as 3 | 4 | 5 };
      }

      if (name === 'protocol') {
        const protocol = value as ConnectionProfile['protocol'];
        const defaultPort = protocol === 'mqtt' ? 1883 : protocol === 'mqtts' ? 8883 : protocol === 'ws' ? 8083 : 8084;
        const path = protocol === 'mqtt' || protocol === 'mqtts' ? '' : prev.path || '/mqtt';
        return {
          ...prev,
          protocol,
          ssl: protocol === 'mqtts' || protocol === 'wss',
          port: prev.port || defaultPort,
          path,
        };
      }

      return { ...prev, [name]: value };
    });
  };

  const selectBroker = (brokerId: string) => {
    const broker = brokers.find((b) => b.id === brokerId);
    if (broker) {
      setProfile((prev) => ({
        ...prev,
        brokerId: broker.id,
        host: broker.host,
        port: broker.port,
        protocol: broker.protocol,
        path: broker.path || (broker.protocol === 'ws' || broker.protocol === 'wss' ? '/mqtt' : ''),
        ssl: broker.ssl,
      }));
      return;
    }

    setProfile((prev) => ({ ...prev, brokerId: undefined }));
  };

  const selectIdentity = (identityId: string) => {
    const identity = identities.find((i) => i.id === identityId);
    if (identity) {
      setProfile((prev) => ({
        ...prev,
        identityId: identity.id,
        username: identity.username || '',
        password: identity.password || '',
        clientId: identity.clientId || prev.clientId,
      }));
      return;
    }

    setProfile((prev) => ({ ...prev, identityId: undefined }));
  };

  if (!isOpen) {
    return null;
  }

  const isWsProtocol = profile.protocol === 'ws' || profile.protocol === 'wss';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-xl font-bold text-slate-800">
            {initialProfile ? t('connectionModal.editTitle') : t('connectionModal.newTitle')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-7 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative group">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{t('connectionModal.brokerConfig')}</label>
                  <button onClick={() => onOpenSettings('brokers')} className="text-[10px] text-indigo-600 font-bold hover:underline">
                    {t('connectionModal.manageLibrary')}
                  </button>
                </div>

                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <i className="fas fa-server absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <select
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 appearance-none"
                      value={profile.brokerId || 'custom'}
                      onChange={(e) => selectBroker(e.target.value)}
                    >
                      <option value="custom">{t('connectionModal.customOneOff')}</option>
                      <optgroup label={t('connectionModal.fromLibrary')}>
                        {brokers.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.host})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-3 text-sm ${profile.brokerId ? 'opacity-70 pointer-events-none' : ''}`}>
                  <div className="col-span-2 flex rounded-md shadow-sm">
                    <select
                      name="protocol"
                      value={profile.protocol}
                      onChange={handleLinkChange}
                      className="px-2 py-1.5 bg-slate-100 border border-slate-300 border-r-0 rounded-l-md text-slate-600 text-xs"
                    >
                      <option value="mqtt">mqtt://</option>
                      <option value="mqtts">mqtts://</option>
                      <option value="ws">ws://</option>
                      <option value="wss">wss://</option>
                    </select>
                    <input
                      type="text"
                      name="host"
                      value={profile.host}
                      onChange={handleLinkChange}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-r-md text-slate-700 font-mono"
                      placeholder={t('connectionModal.placeholders.host')}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">{t('connectionModal.port')}</span>
                    <input
                      type="number"
                      name="port"
                      value={profile.port}
                      onChange={handleLinkChange}
                      className="w-full border border-slate-300 rounded-md pl-12 pr-2 py-1.5 text-right font-mono"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">{t('connectionModal.path')}</span>
                    <input
                      type="text"
                      name="path"
                      value={profile.path || ''}
                      onChange={handleLinkChange}
                      className="w-full border border-slate-300 rounded-md pl-12 pr-2 py-1.5 text-right font-mono"
                      placeholder={isWsProtocol ? t('connectionModal.placeholders.wsMountPath') : t('connectionModal.placeholders.pathTcp')}
                      disabled={!isWsProtocol}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">{t('connectionModal.mqttVersion')}</label>
                    <select
                      name="protocolVersion"
                      value={profile.protocolVersion || 4}
                      onChange={handleLinkChange}
                      className="w-full border border-slate-300 rounded-md px-3 py-1.5 bg-white"
                    >
                      <option value={3}>3.0</option>
                      <option value={4}>3.1.1</option>
                      <option value={5}>5.0</option>
                    </select>
                  </div>
                </div>
                {profile.protocol === 'ws' && isHttps && (
                  <div className="mt-2 text-xs text-amber-600 flex items-center gap-1 bg-amber-50 p-2 rounded border border-amber-100">
                    <i className="fas fa-exclamation-triangle"></i> {t('connectionModal.httpsRequiresWss')}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{t('connectionModal.authIdentity')}</label>
                  <button onClick={() => onOpenSettings('identities')} className="text-[10px] text-indigo-600 font-bold hover:underline">
                    {t('connectionModal.manageLibrary')}
                  </button>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <i className="fas fa-id-card absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <select
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 appearance-none"
                      value={profile.identityId || 'custom'}
                      onChange={(e) => selectIdentity(e.target.value)}
                    >
                      <option value="custom">{t('connectionModal.customOneOff')}</option>
                      <optgroup label={t('connectionModal.fromLibrary')}>
                        {identities.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className={`space-y-3 text-sm ${profile.identityId ? 'opacity-70 pointer-events-none' : ''}`}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">{t('connectionModal.username')}</label>
                      <input
                        type="text"
                        name="username"
                        value={profile.username || ''}
                        onChange={handleLinkChange}
                        className="border border-slate-300 rounded-md px-3 py-1.5 w-full"
                        placeholder={t('common.optional')}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">{t('connectionModal.password')}</label>
                      <input
                        type="password"
                        name="password"
                        value={profile.password || ''}
                        onChange={handleLinkChange}
                        className="border border-slate-300 rounded-md px-3 py-1.5 w-full"
                        placeholder={t('common.optional')}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('connectionModal.clientIdUnique')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="clientId"
                      value={profile.clientId}
                      onChange={handleLinkChange}
                      className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 font-mono text-sm"
                    />
                    <button
                      onClick={() => setProfile((p) => ({ ...p, clientId: `nexus-${Math.random().toString(16).substring(2, 10)}` }))}
                      className="px-3 bg-slate-200 rounded-md hover:bg-slate-300 text-slate-600"
                    >
                      <i className="fas fa-random"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 md:col-span-5 space-y-6">
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <h3 className="text-indigo-800 font-bold mb-4 flex items-center gap-2">
                  <i className="fas fa-info-circle"></i> {t('connectionModal.instanceDetails')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">{t('connectionModal.displayName')}</label>
                    <input
                      type="text"
                      name="name"
                      value={profile.name}
                      onChange={handleLinkChange}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder={t('connectionModal.placeholders.displayName')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">{t('connectionModal.groupFolder')}</label>
                    <input
                      type="text"
                      name="group"
                      value={profile.group || ''}
                      onChange={handleLinkChange}
                      list="groups-list"
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder={t('connectionModal.placeholders.group')}
                    />
                    <datalist id="groups-list">{existingGroups.map((g) => <option key={g} value={g} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t('connectionModal.colorTag')}</label>
                    <div className="flex gap-2 flex-wrap bg-white p-3 rounded-lg border border-indigo-100">
                      {Object.entries(TAG_COLORS).map(([name, bgClass]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setProfile((p) => ({ ...p, colorTag: name }))}
                          className={`w-6 h-6 rounded-full ${bgClass} transition-transform ${profile.colorTag === name ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110' : 'opacity-60 hover:opacity-100'}`}
                          title={name}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2 bg-white p-3 rounded-lg border border-indigo-100">
                    <input
                      type="checkbox"
                      name="clean"
                      checked={profile.clean}
                      onChange={handleLinkChange}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{t('connectionModal.cleanSession')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-800 font-medium">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onSave(profile)}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg shadow-indigo-200 font-bold transition-transform active:scale-95"
          >
            {initialProfile ? t('connectionModal.saveChanges') : t('connectionModal.createConnection')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
