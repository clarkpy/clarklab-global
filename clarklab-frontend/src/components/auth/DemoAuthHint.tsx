import { KeyRound, UserRound } from 'lucide-react'
import { AccentTag } from '@/components/ui/AccentTag'
import { DEMO_ACCESS_CODE, DEMO_PASSWORD, DEMO_USERNAME } from '@/lib/api'

type DemoAuthHintProps =
  | {
      variant: 'login'
      onUseDemo: (username: string, password: string) => void
    }
  | {
      variant: 'signup'
      onUseAccessCode: (code: string) => void
    }

export function DemoAuthHint(props: DemoAuthHintProps) {
  if (props.variant === 'login') {
    return (
      <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-4 light:border-violet-200 light:bg-violet-50">
        <AccentTag variant="violet" size="xs" icon={UserRound}>
          Demo account
        </AccentTag>
        <dl className="theme-subheading mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="theme-muted">Username</dt>
            <dd className="theme-heading font-mono">{DEMO_USERNAME}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="theme-muted">Password</dt>
            <dd className="theme-heading font-mono">{DEMO_PASSWORD}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => props.onUseDemo(DEMO_USERNAME, DEMO_PASSWORD)}
          className="theme-link mt-4 text-sm font-semibold transition-colors focus:outline-none"
        >
          Use demo credentials
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-4 light:border-violet-200 light:bg-violet-50">
      <AccentTag variant="violet" size="xs" icon={KeyRound}>
        Demo access code
      </AccentTag>
      <p className="theme-heading mt-3 font-mono text-sm">{DEMO_ACCESS_CODE}</p>
      <button
        type="button"
        onClick={() => props.onUseAccessCode(DEMO_ACCESS_CODE)}
        className="theme-link mt-4 text-sm font-semibold transition-colors focus:outline-none"
      >
        Use demo code
      </button>
    </div>
  )
}
