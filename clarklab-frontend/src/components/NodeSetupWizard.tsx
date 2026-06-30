import { useState } from 'react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { TokenExpiryCountdown } from '@/components/TokenExpiryCountdown'
import { Card } from '@/components/ui/card'
import {
  DEFAULT_NODE_DATA_ROOT,
  LOCAL_DEV_DATA_ROOT,
  withRegistrationDataRoot,
} from '@/lib/nodeDataRoot'
import {
  DEV_PLATFORM_OPTIONS,
  detectDevPlatform,
  type DevLocalPlatformCommands,
  type DevPlatform,
} from '@/lib/devAgentCommands'
import type { NodeRegistrationResult, NodeSetupStatus } from '@/lib/domainTypes'

interface NodeSetupWizardProps {
  setupStatus: NodeSetupStatus
  registration: NodeRegistrationResult | null
  dataRoot: string
  onDataRootChange: (value: string) => void
  onDataRootSave: () => void
  dataRootSaving?: boolean
  onRegenerate: () => void
  regenerating: boolean
  variant?: 'setup' | 'reconnect'
}

type StepState = 'done' | 'current' | 'upcoming' | 'waiting'

function dataRootPresets(onSelect: (value: string) => void, disabled: boolean) {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        { label: 'Production', value: DEFAULT_NODE_DATA_ROOT },
        { label: 'Local dev', value: LOCAL_DEV_DATA_ROOT },
      ].map((preset) => (
        <button
          key={preset.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(preset.value)}
          className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}

function stepState(index: number, setupStatus: NodeSetupStatus): StepState {
  if (index === 0) {
    return setupStatus.tokenGenerated ? 'done' : 'current'
  }
  if (index === 1) {
    if (setupStatus.tokenGenerated) return 'done'
    return setupStatus.tokenGenerated ? 'current' : 'upcoming'
  }
  if (index === 2) {
    if (setupStatus.registrationComplete) return 'done'
    return setupStatus.tokenGenerated ? 'current' : 'upcoming'
  }
  if (index === 3) {
    if (setupStatus.heartbeatReceived) return 'done'
    if (setupStatus.registrationComplete) return 'current'
    return 'upcoming'
  }
  if (setupStatus.heartbeatReceived) return 'done'
  if (setupStatus.registrationComplete) return 'waiting'
  return 'upcoming'
}

function CommandBlock({
  label,
  command,
  copyLabel,
}: {
  label: string
  command: string
  copyLabel: string
}) {
  return (
    <div className="theme-glass rounded-2xl px-4 py-3">
      <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">{label}</p>
      <div className="mt-2 flex items-start justify-between gap-2">
        <code className="theme-subheading block flex-1 font-mono text-xs leading-relaxed break-all">
          {command}
        </code>
        <CopyButton value={command} label={copyLabel} />
      </div>
    </div>
  )
}

function DevPlatformPicker({
  platform,
  onPlatformChange,
}: {
  platform: DevPlatform
  onPlatformChange: (platform: DevPlatform) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Development platform">
      {DEV_PLATFORM_OPTIONS.map((option) => {
        const selected = platform === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onPlatformChange(option.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              selected
                ? 'border border-violet-400/40 bg-violet-500/15 text-violet-100 light:text-violet-900'
                : 'theme-btn-secondary'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function LocalDevCommandsPanel({
  commands,
  platform,
  onPlatformChange,
  mode,
}: {
  commands: DevLocalPlatformCommands | null
  platform: DevPlatform
  onPlatformChange: (platform: DevPlatform) => void
  mode: 'register' | 'run'
}) {
  if (!commands) {
    return (
      <p className="theme-muted text-sm">
        {mode === 'register'
          ? 'Register command unavailable — regenerate token'
          : 'Run command unavailable — regenerate token'}
      </p>
    )
  }

  if (mode === 'register') {
    return (
      <div className="space-y-3">
        <DevPlatformPicker platform={platform} onPlatformChange={onPlatformChange} />
        <CommandBlock label="Build once" command={commands.build} copyLabel="Copy build command" />
        <CommandBlock label="Register" command={commands.register} copyLabel="Copy register command" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <DevPlatformPicker platform={platform} onPlatformChange={onPlatformChange} />
      <CommandBlock label="Run" command={commands.run} copyLabel="Copy run command" />
    </div>
  )
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15">
        <Check className="h-4 w-4 theme-accent-emerald" aria-hidden="true" />
      </span>
    )
  }
  if (state === 'waiting' || state === 'current') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/15">
        <Loader2 className="h-4 w-4 animate-spin text-violet-300 light:text-violet-600" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 light:border-slate-200">
      <Circle className="theme-muted h-3 w-3" aria-hidden="true" />
    </span>
  )
}

export function NodeSetupWizard({
  setupStatus,
  registration,
  dataRoot,
  onDataRootChange,
  onDataRootSave,
  dataRootSaving = false,
  onRegenerate,
  regenerating,
  variant = 'setup',
}: NodeSetupWizardProps) {
  const isReconnect = variant === 'reconnect'
  const [setupMethod, setSetupMethod] = useState<'installer' | 'manual'>(
    isReconnect ? 'manual' : 'installer',
  )
  const [devPlatform, setDevPlatform] = useState<DevPlatform>(detectDevPlatform)
  const tokenReady = Boolean(registration?.token) && (setupStatus.tokenActive || !setupStatus.registrationComplete)
  const tokenExpired = setupStatus.tokenGenerated && !setupStatus.tokenActive && !setupStatus.registrationComplete
  const registrationWithDataRoot = registration
    ? withRegistrationDataRoot(registration, dataRoot)
    : null
  const installCommand = registrationWithDataRoot?.installCommand ?? ''
  const devLocalCommands = registrationWithDataRoot?.devLocalCommands ?? null
  const activeDevCommands = devLocalCommands?.[devPlatform] ?? null

  const steps = [
    {
      title: 'Data directory',
      body: (
        <div className="space-y-3">
          {dataRootPresets(onDataRootChange, setupStatus.registrationComplete || dataRootSaving)}
          <input
            type="text"
            value={dataRoot}
            onChange={(e) => onDataRootChange(e.target.value)}
            onBlur={onDataRootSave}
            disabled={setupStatus.registrationComplete || dataRootSaving}
            className="theme-glass theme-heading w-full rounded-2xl border px-4 py-3 font-mono text-sm"
          />
          <p className="theme-muted text-xs leading-6">
            Database volumes are stored under this path on the node. Default is{' '}
            <code className="font-mono">{DEFAULT_NODE_DATA_ROOT}</code>.
          </p>
          {dataRootSaving ? (
            <p className="theme-muted text-xs">Saving data directory…</p>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Registration token',
      body: (
        <div className="space-y-3">
          {registration?.token ? (
            <div className="theme-glass rounded-2xl px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <code className="theme-accent-violet text-sm font-semibold break-all">{registration.token}</code>
                <CopyButton value={registration.token} label="Copy token" />
              </div>
              <p className="theme-muted mt-2 text-xs">
                <TokenExpiryCountdown
                  expiresAtIso={setupStatus.tokenExpiresAtIso ?? registration.expiresAtIso}
                  expiresAt={setupStatus.tokenExpiresAt ?? registration.expiresAt}
                />
              </p>
              {!tokenExpired && registration?.token ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={regenerating}
                  className="theme-muted text-xs font-semibold underline-offset-2 transition hover:text-violet-400 hover:underline light:hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {regenerating ? 'Regenerating…' : 'Regenerate token'}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="theme-muted text-sm">No active token in this browser session.</p>
          )}
          {tokenExpired ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
              <p className="theme-accent-amber text-sm font-semibold">Token expired or already used</p>
              <p className="theme-muted mt-1 text-xs leading-6">
                Generate a new token to continue setup on this machine.
              </p>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenerating}
                className="mt-3 rounded-full border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50 light:text-amber-900"
              >
                {regenerating ? 'Regenerating…' : 'Regenerate token'}
              </button>
            </div>
          ) : null}
          {!tokenExpired && !registration?.token ? (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="theme-btn-secondary rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenerating ? 'Generating…' : 'Generate token'}
            </button>
          ) : null}
        </div>
      ),
    },
    {
      title: isReconnect ? 'Register the agent again' : 'Install and register',
      body: (
        <div className={tokenReady ? '' : 'pointer-events-none opacity-50'}>
          {!isReconnect && installCommand ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Agent setup method">
              <button
                type="button"
                role="radio"
                aria-checked={setupMethod === 'installer'}
                onClick={() => setSetupMethod('installer')}
                className={`rounded-2xl border p-3 text-left transition ${
                  setupMethod === 'installer'
                    ? 'border-violet-400/40 bg-violet-500/10'
                    : 'theme-glass hover:border-violet-400/25'
                }`}
              >
                <span className="theme-heading block text-sm font-black">Install automatically</span>
                <span className="theme-muted mt-1 block text-xs leading-5">
                  Recommended for a persistent Linux server.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={setupMethod === 'manual'}
                onClick={() => setSetupMethod('manual')}
                className={`rounded-2xl border p-3 text-left transition ${
                  setupMethod === 'manual'
                    ? 'border-violet-400/40 bg-violet-500/10'
                    : 'theme-glass hover:border-violet-400/25'
                }`}
              >
                <span className="theme-heading block text-sm font-black">Use a local build</span>
                <span className="theme-muted mt-1 block text-xs leading-5">
                  For development or an agent you already compiled.
                </span>
              </button>
            </div>
          ) : null}

          {setupMethod === 'installer' && !isReconnect ? (
            <div className="theme-glass rounded-2xl px-4 py-3">
              <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">Run on the server</p>
              <div className="mt-2 flex items-start justify-between gap-2">
                <code className="theme-subheading block flex-1 font-mono text-xs leading-relaxed break-all">
                  {installCommand || 'Install command unavailable — regenerate token'}
                </code>
                {installCommand ? <CopyButton value={installCommand} label="Copy install command" /> : null}
              </div>
            </div>
          ) : (
            <LocalDevCommandsPanel
              commands={activeDevCommands}
              platform={devPlatform}
              onPlatformChange={setDevPlatform}
              mode="register"
            />
          )}
          <p className="theme-muted mt-2 text-xs leading-6">
            {setupMethod === 'installer' && !isReconnect
              ? 'Installs the agent, registers this node, and starts a background system service.'
              : isReconnect
                ? 'Run these from the repository root on the host you are reconnecting.'
                : 'Build the agent once, then register it from the repository root on your development machine.'}
          </p>
        </div>
      ),
    },
    {
      title: 'Start agent',
      body: (
        <div className={setupStatus.registrationComplete ? '' : 'pointer-events-none opacity-50'}>
          {setupMethod === 'installer' && !isReconnect ? (
            <div className="theme-glass rounded-2xl px-4 py-3">
              <p className="theme-heading text-sm font-semibold">Started automatically</p>
              <p className="theme-muted mt-1 text-xs leading-6">
                The installer enables and starts the Clarklab agent service. No second command is required.
              </p>
            </div>
          ) : (
            <>
              <LocalDevCommandsPanel
                commands={activeDevCommands}
                platform={devPlatform}
                onPlatformChange={setDevPlatform}
                mode="run"
              />
              <p className="theme-muted mt-2 text-xs leading-6">
                Keep this process running so the node can report heartbeats and execute deployments.
              </p>
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Waiting for node',
      body: (
        <div>
          {setupStatus.heartbeatReceived ? (
            <p className="theme-accent-emerald text-sm font-semibold">
              {isReconnect ? 'Node is back online and reporting metrics.' : 'Node is online and reporting metrics.'}
            </p>
          ) : (
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-violet-300 light:text-violet-600" aria-hidden="true" />
              <div>
                <p className="theme-heading text-sm font-semibold">Waiting for first heartbeat</p>
                <p className="theme-muted mt-1 text-xs leading-6">
                  Usually within 30 seconds after the agent starts. This page updates automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <Card className="p-6">
      <h2 className="theme-heading text-lg font-black">
        {isReconnect ? 'Reconnect checklist' : 'Setup checklist'}
      </h2>
      <p className="theme-subheading mt-2 text-sm leading-6">
        {isReconnect
          ? 'Bring this node back online without losing its settings or history.'
          : 'Complete the checklist, your progress is updated as the control plane receives heartbeats.'}
      </p>
      <ol className="mt-6 space-y-0">
        {steps.map((step, index) => {
          const state = stepState(index, setupStatus)
          const isLast = index === steps.length - 1
          const expanded = state === 'done' || state === 'current' || state === 'waiting'
          return (
            <li key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <StepIcon state={state} />
                {!isLast ? <div className="theme-border-subtle my-1 w-px flex-1 min-h-[1.5rem] border-l" /> : null}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : expanded ? 'pb-8' : 'pb-4'}`}>
                <p className={`text-sm font-black ${state === 'upcoming' ? 'theme-muted' : 'theme-heading'}`}>
                  {step.title}
                </p>
                {expanded ? <div className="mt-3">{step.body}</div> : null}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
