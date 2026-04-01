import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en'
import zh from '@/locales/zh'
import ja from '@/locales/ja'

export const LOCALE_STORAGE_KEY = 'clawmaster.locale'

export type AppLocale = 'en' | 'zh' | 'ja'

function readStoredLocale(): AppLocale | null {
  try {
    const s = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (s === 'en' || s === 'zh' || s === 'ja') return s
  } catch {
    /* ignore */
  }
  return null
}

function detectLocale(): AppLocale {
  const stored = typeof window !== 'undefined' ? readStoredLocale() : null
  if (stored) return stored
  if (typeof navigator === 'undefined') return 'en'
  const nav = navigator.language.toLowerCase()
  if (nav.startsWith('zh')) return 'zh'
  if (nav.startsWith('ja')) return 'ja'
  return 'en'
}

function htmlLang(lng: string): string {
  if (lng === 'zh') return 'zh-CN'
  if (lng === 'ja') return 'ja'
  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  lng: detectLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  // Sync resources are bundled; without this, useTranslation throws a Promise until init
  // resolves and there is no Suspense above StartupDetector → white screen.
  react: { useSuspense: false },
})

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = htmlLang(lng)
  }
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng)
  } catch {
    /* ignore */
  }
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = htmlLang(i18n.language)
}

export default i18n
