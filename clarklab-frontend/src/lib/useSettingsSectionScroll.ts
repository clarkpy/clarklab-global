import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import type { SettingsSectionId } from '@/lib/settingsNav'

export function useSettingsSectionScroll(onSection?: (section: SettingsSectionId) => void) {
  const location = useLocation()

  useEffect(() => {
    const id = location.hash.replace('#', '') as SettingsSectionId
    if (!id) return undefined

    onSection?.(id)

    let attempts = 0
    let timer: number | undefined

    const tryScroll = () => {
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      attempts += 1
      if (attempts < 12) {
        timer = window.setTimeout(tryScroll, 100)
      }
    }

    tryScroll()

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [location.hash, onSection])
}
