import { useEffect } from 'react'
import { useAppContext } from '@/lib/appContext'

export function useMobilePageTitle(title: string | null | undefined) {
  const { setMobileDetailTitle } = useAppContext()

  useEffect(() => {
    if (title) setMobileDetailTitle(title)
    return () => setMobileDetailTitle(null)
  }, [title, setMobileDetailTitle])
}
