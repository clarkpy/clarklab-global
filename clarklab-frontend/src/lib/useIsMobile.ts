import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 1023px)'

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_QUERY).matches
  })

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const handler = (event: MediaQueryListEvent) => setMobile(event.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return mobile
}
