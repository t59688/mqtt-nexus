import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { STORAGE_LANGUAGE_KEY } from '../constants';

export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const getInitialLanguage = (): SupportedLanguage => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  try {
    const savedLanguage = window.localStorage.getItem(STORAGE_LANGUAGE_KEY);
    if (savedLanguage && SUPPORTED_LANGUAGES.includes(savedLanguage as SupportedLanguage)) {
      return savedLanguage as SupportedLanguage;
    }
  } catch (error) {
    console.warn('Failed to read cached language preference', error);
  }

  const browserLanguage = window.navigator.language?.toLowerCase();
  if (browserLanguage?.startsWith('zh')) {
    return 'zh';
  }

  return 'en';
};

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  supportedLngs: [...SUPPORTED_LANGUAGES],
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
