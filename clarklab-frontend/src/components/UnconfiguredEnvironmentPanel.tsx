import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageButton } from '@/components/ui/PageButton'
import { PageSelect } from '@/components/ui/PageSelect'
import {
  copyServiceEnvironment,
  fetchNodes,
  saveServiceSettings,
  type Node,
  type ServiceDetail,
} from '@/lib/api'
import {
  SERVICE_BASE_DOMAIN,
  formatServicePublicUrl,
  normalizeSubdomainInput,
} from '@/lib/serviceDomain'

interface UnconfiguredEnvironmentPanelProps {
  service: ServiceDetail
  environment: 'development' | 'production'
  onConfigured: () => void
  showNotice: (text: string, ok: boolean) => void
}

function formatNodeLabel(node: Node): string {
  const region = node.region ?? 'default'
  return `${node.name} · ${region}`
}

export function UnconfiguredEnvironmentPanel({
  service,
  environment,
  onConfigured,
  showNotice,
}: UnconfiguredEnvironmentPanelProps) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [nodeId, setNodeId] = useState(service.server ?? '')
  const [port, setPort] = useState(String(service.containerPort ?? service.port ?? ''))
  const [subdomain, setSubdomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    fetchNodes(service.projectId)
      .then((items) => {
        setNodes(items.filter((node) => node.status === 'online' || node.status === 'pending'))
        if (service.server) {
          setNodeId(service.server)
        } else if (items[0]) {
          setNodeId(items[0].id)
        }
      })
      .catch(() => setNodes([]))
  }, [service.projectId, service.server])

  const canCopyFromProduction =
    environment !== 'production' && Boolean(service.projectId)

  const setupDisabled = useMemo(() => !nodeId || saving || copying, [nodeId, saving, copying])

  const handleSetup = async () => {
    const parsedPort = Number(port)
    if (!nodeId) {
      showNotice('Choose a node to host this environment.', false)
      return
    }
    if (!Number.isFinite(parsedPort) || parsedPort < 0) {
      showNotice('Enter a valid port.', false)
      return
    }

    setSaving(true)
    try {
      const result = await saveServiceSettings(service.id, {
        env: environment,
        nodeId,
        port: parsedPort,
        subdomain: subdomain.trim() ? normalizeSubdomainInput(subdomain) : undefined,
      })
      showNotice(result.message, result.success)
      if (result.success) onConfigured()
    } finally {
      setSaving(false)
    }
  }

  const handleCopyFromProduction = async () => {
    setCopying(true)
    try {
      const result = await copyServiceEnvironment(service.id, environment, 'production')
      showNotice(result.message, result.success)
      if (result.success) onConfigured()
    } finally {
      setCopying(false)
    }
  }

  return (
    <Card className="mb-6 border-amber-400/25 p-6">
      <h2 className="theme-heading text-lg font-black text-amber-200 light:text-amber-900">
        {environment.charAt(0).toUpperCase() + environment.slice(1)} is not set up yet
      </h2>
      <p className="theme-muted mt-2 text-sm leading-6">
        This environment has no node assignment. Deploy and start stay disabled until you choose
        placement for this slice.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
            Node
          </label>
          <PageSelect
            value={nodeId}
            onValueChange={setNodeId}
            disabled={nodes.length === 0 || saving || copying}
            placeholder="Select a node"
            options={
              nodes.length === 0
                ? [{ value: '', label: 'No nodes available', disabled: true }]
                : nodes.map((node) => ({
                    value: node.id,
                    label: formatNodeLabel(node),
                  }))
            }
          />
        </div>
        <div>
          <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
            Port
          </label>
          <Input
            type="number"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            disabled={saving || copying}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
            Subdomain (optional)
          </label>
          <Input
            value={subdomain}
            onChange={(event) => setSubdomain(event.target.value)}
            placeholder={`my-app.${SERVICE_BASE_DOMAIN}`}
            className="font-mono text-xs"
            disabled={saving || copying}
          />
          {subdomain.trim() ? (
            <p className="theme-muted mt-2 text-xs">{formatServicePublicUrl(subdomain)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <PageButton type="button" size="sm" onClick={() => void handleSetup()} disabled={setupDisabled}>
          {saving ? 'Saving…' : 'Set up environment'}
        </PageButton>
        {canCopyFromProduction ? (
          <PageButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleCopyFromProduction()}
            disabled={copying || saving}
          >
            {copying ? 'Copying…' : 'Copy from production'}
          </PageButton>
        ) : null}
      </div>
    </Card>
  )
}
