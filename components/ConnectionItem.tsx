import React from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionStatus, ConnectionProfile } from '../types';
import { TAG_COLORS } from '../constants';

interface ConnectionItemProps {
  profile: ConnectionProfile;
  status: ConnectionStatus;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onClone: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const statusColors = {
  disconnected: 'bg-slate-500',
  connecting: 'bg-yellow-400 animate-pulse',
  connected: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  error: 'bg-red-500',
};

const ConnectionItem: React.FC<ConnectionItemProps> = ({ profile, status, isActive, onSelect, onDelete, onEdit, onClone, onContextMenu }) => {
  const { t } = useTranslation();
  const tagColor = profile.colorTag ? TAG_COLORS[profile.colorTag] : 'bg-slate-600';

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group relative flex items-center gap-3 p-3 mx-2 rounded-lg cursor-pointer transition-all duration-200 border-l-4 ${
        isActive
          ? 'bg-slate-800 text-white shadow-md border-indigo-500'
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-transparent hover:border-slate-600'
      }`}
    >
      {/* Tag Dot */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${tagColor} opacity-50`}></div>

      {/* Status Indicator */}
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColors[status]}`} />
      
      <div className="flex-1 min-w-0 pr-4">
        <h3 className="font-medium truncate text-sm leading-tight select-none">{profile.name}</h3>
        <p className="text-[11px] opacity-60 truncate font-mono mt-0.5 select-none">{profile.host}</p>
      </div>

      {/* Actions */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex bg-slate-800 shadow-xl rounded-md overflow-hidden border border-slate-700">
        <button 
            onClick={onClone} 
            className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-indigo-400"
            title={t('connectionItem.clone')}
        >
            <i className="fas fa-copy text-xs"></i>
        </button>
        <button 
            onClick={onEdit} 
            className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white"
            title={t('connectionItem.edit')}
        >
            <i className="fas fa-cog text-xs"></i>
        </button>
        <button 
            onClick={onDelete} 
            className="p-1.5 hover:bg-red-900/50 text-slate-400 hover:text-red-400"
            title={t('connectionItem.delete')}
        >
            <i className="fas fa-trash text-xs"></i>
        </button>
      </div>
    </div>
  );
};

export default ConnectionItem;
