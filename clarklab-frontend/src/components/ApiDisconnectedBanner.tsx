import { ChevronDown } from 'lucide-react'
import { API_URL } from '@/lib/config'
import { useApiConnectivity } from '@/lib/apiConnectivity'

export function ApiDisconnectedBanner() {
  const {
    visibleDisconnected,
    checking,
    message,
    disconnectedSince,
    lastCheckedAt,
    elapsedDisconnected,
    checkNow,
  } = useApiConnectivity()

  if (!visibleDisconnected) return null

  return (
    <div
      role="alert"
      className="sticky top-0 z-20 mb-4 rounded-2xl border border-rose-400/30 bg-rose-950/95 px-4 py-3 text-rose-50 backdrop-blur-md light:border-rose-300 light:bg-rose-100 light:text-rose-950 lg:top-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-wide">API lost connection</p>
          <p className="text-xs text-rose-100/80 light:text-rose-800">
            {elapsedDisconnected
              ? `Offline for ${elapsedDisconnected}`
              : 'Waiting for the control plane to respond'}
          </p>
        </div>

        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-rose-300/30 px-3 py-1.5 text-xs font-semibold marker:content-none light:border-rose-400/50">
            More info
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-[min(100vw-2rem,24rem)] rounded-2xl border border-rose-300/20 bg-rose-950 p-4 text-xs leading-6 shadow-xl light:border-rose-300 light:bg-white light:text-rose-950">
            <p>
              Your device cannot reach the API. This can happen briefly during control plane
              rebuilds.
            </p>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="font-semibold uppercase tracking-[0.2em] text-[10px] text-rose-200 light:text-rose-700">
                  API URL
                </dt>
                <dd className="mt-1 break-all font-mono">{API_URL || '(same origin)'}</dd>
              </div>
              {message ? (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.2em] text-[10px] text-rose-200 light:text-rose-700">
                    Last error
                  </dt>
                  <dd className="mt-1">{message}</dd>
                </div>
              ) : null}
              {disconnectedSince ? (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.2em] text-[10px] text-rose-200 light:text-rose-700">
                    Disconnected since
                  </dt>
                  <dd className="mt-1">{new Date(disconnectedSince).toLocaleString()}</dd>
                </div>
              ) : null}
              {lastCheckedAt ? (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.2em] text-[10px] text-rose-200 light:text-rose-700">
                    Last check
                  </dt>
                  <dd className="mt-1">{new Date(lastCheckedAt).toLocaleString()}</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              className="mt-4 rounded-full border border-rose-300/40 px-3 py-1.5 text-xs font-semibold light:border-rose-400"
              onClick={checkNow}
              disabled={checking}
            >
              {checking ? 'Checking…' : 'Retry now'}
            </button>
          </div>
        </details>
      </div>
    </div>
  )
}
