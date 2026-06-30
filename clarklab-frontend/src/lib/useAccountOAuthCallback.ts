import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { completeGitHubOAuth } from '@/lib/api'
import { toast } from '@/lib/toast'

interface UseAccountOAuthCallbackOptions {
  onConnected?: () => void
}

export function useAccountOAuthCallback({ onConnected }: UseAccountOAuthCallbackOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const onConnectedRef = useRef(onConnected)

  useEffect(() => {
    onConnectedRef.current = onConnected
  }, [onConnected])

  const oauthCode = searchParams.get('code')
  const oauthState = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const clearOAuthParams = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('code')
        next.delete('state')
        next.delete('error')
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    if (oauthError) {
      toast.failed('GitHub authorization was denied')
      clearOAuthParams()
      return
    }
    if (!oauthCode || !oauthState) return

    let cancelled = false
    completeGitHubOAuth(oauthCode, oauthState)
      .then(() => {
        if (cancelled) return
        toast.success('GitHub account connected')
        onConnectedRef.current?.()
      })
      .catch((err) => {
        if (cancelled) return
        toast.failed(err instanceof Error ? err.message : 'GitHub connection failed')
      })
      .finally(() => {
        if (!cancelled) clearOAuthParams()
      })

    return () => {
      cancelled = true
    }
  }, [oauthCode, oauthState, oauthError])

  return { oauthCode, oauthState, oauthError }
}
