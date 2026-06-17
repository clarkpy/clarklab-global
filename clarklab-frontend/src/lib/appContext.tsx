import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface AppContextType {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
}

const THEME_KEY = 'clarklab_theme'

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.remove('dark')
    root.classList.add('light')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    const saved = (localStorage.getItem(THEME_KEY) as 'dark' | 'light') ?? 'dark'
    applyTheme(saved)
    return saved
  })

  const setTheme = (next: 'dark' | 'light') => {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
  }

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <AppContext.Provider value={{ sidebarOpen, setSidebarOpen, theme, setTheme }}>
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
