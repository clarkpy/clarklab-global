import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import {
  THEME_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
  type ResolvedTheme,
} from '@/lib/theme'

interface AppContextType {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  themePreference: ThemePreference
  setThemePreference: (preference: ThemePreference) => void
  resolvedTheme: ResolvedTheme
  mobileDetailTitle: string | null
  setMobileDetailTitle: (title: string | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileDetailTitle, setMobileDetailTitle] = useState<string | null>(null)
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
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}
