import { useMemo } from 'react'
import { Check, X } from 'lucide-react'

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = useMemo(() => {
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[^a-zA-Z\d]/.test(password)) score++

    if (score <= 2) return { label: 'Weak', color: 'text-rose-400', bg: 'bg-rose-500/20', percent: 33 }
    if (score <= 3) return { label: 'Fair', color: 'text-amber-400', bg: 'bg-amber-500/20', percent: 66 }
    return { label: 'Strong', color: 'text-emerald-400', bg: 'bg-emerald-500/20', percent: 100 }
  }, [password])

  const checks = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'Uppercase & lowercase', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Number', met: /\d/.test(password) },
    { label: 'Special character', met: /[^a-zA-Z\d]/.test(password) },
  ]

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.35em] text-slate-400">Password strength</span>
          <span className={`text-xs font-semibold uppercase ${strength.color}`}>{strength.label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full transition-all duration-300 ${strength.bg}`}
            style={{ width: `${strength.percent}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 text-xs text-slate-400">
            {check.met ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <X className="h-4 w-4 text-slate-500" />
            )}
            {check.label}
          </div>
        ))}
      </div>
    </div>
  )
}
