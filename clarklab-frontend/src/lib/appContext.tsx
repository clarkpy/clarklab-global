import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import {
  THEME_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
  type ResolvedTheme,
} from '@/lib/theme'
import { DEFAULT_APP_BRAND_NAME, DEFAULT_APP_DOMAIN } from '@/lib/config'
import { fetchClarklabConfig } from '@/lib/api'

interface AppContextType {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  themePreference: ThemePreference
  setThemePreference: (preference: ThemePreference) => void
  resolvedTheme: ResolvedTheme
  mobileDetailTitle: string | null
  setMobileDetailTitle: (title: string | null) => void
  appBrandName: string
  setAppBrandName: (name: string) => void
  appDomain: string
  setAppDomain: (domain: string) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileDetailTitle, setMobileDetailTitle] = useState<string | null>(null)
  const [appBrandName, setAppBrandName] = useState(DEFAULT_APP_BRAND_NAME)
  const [appDomain, setAppDomain] = useState(DEFAULT_APP_DOMAIN)
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    const preference = readThemePreference()
    applyTheme(resolveTheme(preference))
    return preference
  })
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readThemePreference()),
  )

  const setThemePreference = (next: ThemePreference) => {
    setThemePreferenceState(next)
    localStorage.setItem(THEME_KEY, next)
    const resolved = resolveTheme(next)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }

  useEffect(() => {
    fetchClarklabConfig()
      .then((config) => {
        if (config.appBrandName?.trim()) {
          setAppBrandName(config.appBrandName.trim())
        }
        if (config.appDomain?.trim()) {
          setAppDomain(config.appDomain.trim().toLowerCase())
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.title = appBrandName
  }, [appBrandName])

  useEffect(() => {
    if (themePreference !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const resolved = resolveTheme('system')
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [themePreference])

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        themePreference,
        setThemePreference,
        resolvedTheme,
        mobileDetailTitle,
        setMobileDetailTitle,
        appBrandName,
        setAppBrandName,
        appDomain,
        setAppDomain,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}
