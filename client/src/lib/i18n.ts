import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from '../translations/en.json';
import hiTranslations from '../translations/hi.json';
import mrTranslations from '../translations/mr.json';

const resources = {
  en: {
    translation: enTranslations
  },
  hi: {
    translation: hiTranslations
  },
  mr: {
    translation: mrTranslations
  }
};

console.debug('Initializing i18n with resources:', Object.keys(resources));

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    react: {
      useSuspense: false,
    },
    returnNull: false,
    returnEmptyString: false,
    returnObjects: true,
    saveMissing: true,
    debug: true,
    preload: ['en', 'hi', 'mr'],
    load: 'all',
  });

// Initialize HTML lang attribute
document.documentElement.lang = i18n.language;
console.debug('Initial language set to:', i18n.language);

// Update HTML lang attribute when language changes
i18n.on('languageChanged', (lng) => {
  console.debug('Language changed to:', lng);
  document.documentElement.lang = lng;
});

// Add missing key logging
i18n.on('missingKey', (lngs, namespace, key, res) => {
  console.warn('Missing translation:', { languages: lngs, namespace, key, result: res });
});

export default i18n;