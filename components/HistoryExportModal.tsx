import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type HistoryExportFormat = 'ndjson' | 'csv';
export type HistoryRangePreset = '1h' | '6h' | '12h' | '24h' | '7d' | 'all' | 'custom';

export interface HistoryExportRequest {
  format: HistoryExportFormat;
  outputPath: string;
  fromTs?: number;
  toTs?: number;
}

interface HistoryExportModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  initialFormat: HistoryExportFormat;
  initialPath: string;
  onClose: () => void;
  onBrowsePath: (format: HistoryExportFormat) => Promise<string | null>;
  onExport: (request: HistoryExportRequest) => Promise<void>;
}

const PRESET_MS: Record<Exclude<HistoryRangePreset, 'all' | 'custom'>, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const toDateTimeLocal = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (v: number) => v.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const HistoryExportModal: React.FC<HistoryExportModalProps> = ({
  isOpen,
  isSubmitting,
  initialFormat,
  initialPath,
  onClose,
  onBrowsePath,
  onExport,
}) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<HistoryExportFormat>('ndjson');
  const [outputPath, setOutputPath] = useState('');
  const [preset, setPreset] = useState<HistoryRangePreset>('24h');
  const [customFrom, setCustomFrom] = useState(toDateTimeLocal(Date.now() - PRESET_MS['24h']));
  const [customTo, setCustomTo] = useState(toDateTimeLocal(Date.now()));

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFormat(initialFormat);
    setOutputPath(initialPath);
    setPreset('24h');
    setCustomFrom(toDateTimeLocal(Date.now() - PRESET_MS['24h']));
    setCustomTo(toDateTimeLocal(Date.now()));
  }, [initialFormat, initialPath, isOpen]);

  const presetOptions = useMemo(
    () => [
      { key: '1h' as const, label: t('messageLog.range1h') },
      { key: '6h' as const, label: t('messageLog.range6h') },
      { key: '12h' as const, label: t('messageLog.range12h') },
      { key: '24h' as const, label: t('messageLog.range24h') },
      { key: '7d' as const, label: t('messageLog.range7d') },
      { key: 'all' as const, label: t('messageLog.rangeAll') },
      { key: 'custom' as const, label: t('messageLog.rangeCustom') },
    ],
    [t]
  );

  if (!isOpen) {
    return null;
  }

  const handleBrowse = async () => {
    const selected = await onBrowsePath(format);
    if (selected) {
      setOutputPath(selected);
    }
  };

  const handleSubmit = async () => {
    if (!outputPath.trim()) {
      return;
    }

    let fromTs: number | undefined;
    let toTs: number | undefined;
    const now = Date.now();

    if (preset !== 'all') {
      if (preset === 'custom') {
        const parsedFrom = customFrom ? new Date(customFrom).getTime() : NaN;
        const parsedTo = customTo ? new Date(customTo).getTime() : NaN;
        if (Number.isFinite(parsedFrom)) {
          fromTs = parsedFrom;
        }
        if (Number.isFinite(parsedTo)) {
          toTs = parsedTo;
        }
      } else {
        const delta = PRESET_MS[preset];
        fromTs = now - delta;
        toTs = now;
      }
    }

    await onExport({
      format,
      outputPath: outputPath.trim(),
      fromTs,
      toTs,
    });
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">{t('messageLog.exportTitle')}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t('messageLog.exportDescription')}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                {t('messageLog.exportFormat')}
              </label>
              <select
                value={format}
                disabled={isSubmitting}
                onChange={(event) => setFormat(event.target.value as HistoryExportFormat)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ndjson">NDJSON</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                {t('messageLog.exportPath')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={outputPath}
                  disabled={isSubmitting}
                  onChange={(event) => setOutputPath(event.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                  placeholder={t('messageLog.exportPathPlaceholder')}
                />
                <button
                  onClick={() => {
                    void handleBrowse();
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors disabled:opacity-50"
                >
                  {t('messageLog.browsePath')}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
              {t('messageLog.rangePreset')}
            </label>
            <div className="flex flex-wrap gap-2">
              {presetOptions.map((item) => (
                <button
                  key={item.key}
                  disabled={isSubmitting}
                  onClick={() => setPreset(item.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    preset === item.key
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {preset === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                  {t('messageLog.fromTime')}
                </label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  disabled={isSubmitting}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                  {t('messageLog.toTime')}
                </label>
                <input
                  type="datetime-local"
                  value={customTo}
                  disabled={isSubmitting}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting || !outputPath.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {isSubmitting ? t('messageLog.exporting') : t('messageLog.startExport')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryExportModal;
