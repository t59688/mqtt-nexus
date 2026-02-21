import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface SimpleInputModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => void;
  options?: string[]; // For autocomplete suggestions
}

const SimpleInputModal: React.FC<SimpleInputModalProps> = ({ 
    isOpen, title, label, initialValue, onClose, onSave, options 
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      // Focus input after a short delay to ensure render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <i className="fas fa-times"></i>
            </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
            <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</label>
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    list={options ? "modal-datalist" : undefined}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-700"
                />
                {options && (
                    <datalist id="modal-datalist">
                        {options.map((opt) => (
                            <option key={opt} value={opt} />
                        ))}
                    </datalist>
                )}
            </div>

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors font-medium text-sm"
                >
                    {t('common.cancel')}
                </button>
                <button
                    type="submit"
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-transform active:scale-95 font-bold text-sm"
                >
                    {t('common.save')}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default SimpleInputModal;
