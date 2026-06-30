import type { LucideIcon } from 'lucide-react'
import {
  Clock3,
  Cpu,
  HardDrive,
  MemoryStick,
  RotateCcw,
  Thermometer,
  Wifi,
} from 'lucide-react'
import type { Node, NodeMetrics, NodeStatus, ServiceDetail, ServiceStatus } from '@/lib/domainTypes'

export type MetricColor = 'violet' | 'sky' | 'emerald' | 'cyan' | 'amber' | 'fuchsia'

export interface MetricHistoryPoint {
  label: string
  value: number
  recordedAt?: string
}

export type MetricHistoryRange = '1h' | '12h' | '24h' | '7d'
export type MetricHistoryKey = 'cpu' | 'memory' | 'disk' | 'network' | 'temperature' | 'uptime'

export interface MetricHistorySource {
  subjectType: 'node' | 'service' | 'fleet'
  subjectId?: string
  metricKey: MetricHistoryKey
}

export const METRIC_HISTORY_RANGES: Array<{ value: MetricHistoryRange; label: string }> = [
  { value: '1h', label: '1h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
]

export interface SystemMetric {
  id: string
  name: string
  value: string
  detail?: string
  status: 'ok' | 'warning' | 'error'
  icon: LucideIcon
  color: MetricColor
  unit: string
  summary: string
  history: MetricHistoryPoint[]
  historySource?: MetricHistorySource
  stats: {
    minimum: string
    maximum: string
    average: string
  }
}

function buildHistory(
  labels: string[],
  values: number[],
): MetricHistoryPoint[] {
  return labels.map((label, index) => ({
    label,
    value: values[index] ?? values[values.length - 1],
  }))
}

const hourLabels = ['24h', '21h', '18h', '15h', '12h', '9h', '6h', '3h', 'now']

export const systemMetrics: SystemMetric[] = [
  {
    id: 'cpu',
    name: 'CPU Usage',
    value: '34%',
    detail: 'current load',
    status: 'ok',
    icon: Cpu,
    color: 'violet',
    unit: '%',
    summary: 'Processor load has stayed within normal range over the last day with a brief spike during overnight backups.',
    history: buildHistory(hourLabels, [22, 28, 31, 26, 38, 42, 35, 33, 34]),
    stats: {
      minimum: '22%',
      maximum: '42%',
      average: '31%',
    },
  },
  {
    id: 'memory',
    name: 'Memory',
    value: '67%',
    detail: '16GB / 24GB',
    status: 'ok',
    icon: MemoryStick,
    color: 'sky',
    unit: '%',
    summary: 'Memory consumption is climbing gradually as container workloads scale up during peak hours.',
    history: buildHistory(hourLabels, [58, 60, 61, 63, 64, 66, 68, 67, 67]),
    stats: {
      minimum: '58%',
      maximum: '68%',
      average: '63%',
    },
  },
  {
    id: 'disk',
    name: 'Disk Space',
    value: '823GB',
    detail: 'free',
    status: 'ok',
    icon: HardDrive,
    color: 'emerald',
    unit: 'GB',
    summary: 'Available storage is stable with a slow downward trend from media ingestion and log retention.',
    history: buildHistory(hourLabels, [836, 834, 832, 830, 828, 826, 825, 824, 823]),
    stats: {
      minimum: '823GB',
      maximum: '836GB',
      average: '828GB',
    },
  },
  {
    id: 'network',
    name: 'Network',
    value: '425 Mbps',
    detail: '89 Mbps up',
    status: 'ok',
    icon: Wifi,
    color: 'cyan',
    unit: 'Mbps',
    summary: 'Download throughput peaked during evening streaming while upload remained steady for remote sync.',
    history: buildHistory(hourLabels, [180, 220, 310, 280, 390, 425, 360, 410, 425]),
    stats: {
      minimum: '180 Mbps',
      maximum: '425 Mbps',
      average: '311 Mbps',
    },
  },
  {
    id: 'temperature',
    name: 'Temperature',
    value: '52°C',
    detail: 'nominal',
    status: 'ok',
    icon: Thermometer,
    color: 'amber',
    unit: '°C',
    summary: 'Hardware temperature remains nominal with minor increases during sustained CPU activity.',
    history: buildHistory(hourLabels, [44, 46, 47, 48, 50, 53, 51, 52, 52]),
    stats: {
      minimum: '44°C',
      maximum: '53°C',
      average: '49°C',
    },
  },
  {
    id: 'uptime',
    name: 'Uptime',
    value: '45 days',
    detail: '12h 23m',
    status: 'ok',
    icon: Clock3,
    color: 'fuchsia',
    unit: '%',
    summary: 'Service availability has remained above 99% with only brief maintenance windows this month.',
    history: buildHistory(hourLabels, [100, 100, 99.8, 100, 100, 99.9, 100, 100, 100]),
    stats: {
      minimum: '99.8%',
      maximum: '100%',
      average: '99.9%',
    },
  },
]

export const metricChartColors: Record<MetricColor, { stroke: string; fill: string }> = {
  violet: { stroke: '#c4b5fd', fill: 'rgba(168,85,247,0.22)' },
  sky: { stroke: '#7dd3fc', fill: 'rgba(56,189,248,0.22)' },
  emerald: { stroke: '#6ee7b7', fill: 'rgba(52,211,153,0.22)' },
  cyan: { stroke: '#67e8f9', fill: 'rgba(34,211,238,0.22)' },
  amber: { stroke: '#fcd34d', fill: 'rgba(251,191,36,0.22)' },
  fuchsia: { stroke: '#f0abfc', fill: 'rgba(217,70,239,0.22)' },
}

export const metricStyles = {
  violet: {
    background: 'bg-violet-500/10',
    icon: 'theme-metric-violet-icon',
    value: 'theme-metric-violet-value',
    detail: 'theme-metric-violet-detail',
    shadow: 'hover:shadow-[0_0_28px_rgba(168,85,247,0.16)]',
    active: 'border-violet-400/50 bg-violet-500/10',
  },
  sky: {
    background: 'bg-sky-500/10',
    icon: 'theme-metric-sky-icon',
    value: 'theme-metric-sky-value',
    detail: 'theme-metric-sky-detail',
    shadow: 'hover:shadow-[0_0_28px_rgba(56,189,248,0.14)]',
    active: 'border-sky-400/50 bg-sky-500/10',
  },
  emerald: {
    background: 'bg-emerald-500/10',
    icon: 'theme-metric-emerald-icon',
    value: 'theme-metric-emerald-value',
    detail: 'theme-metric-emerald-detail',
    shadow: 'hover:shadow-[0_0_28px_rgba(52,211,153,0.14)]',
    active: 'border-emerald-400/50 bg-emerald-500/10',
  },
  cyan: {
    background: 'bg-cyan-500/10',
    icon: 'theme-metric-cyan-icon',
    value: 'theme-metric-cyan-value',
    detail: 'theme-metric-cyan-detail',
    shadow: 'hover:shadow-[0_0_28px_rgba(34,211,238,0.14)]',
    active: 'border-cyan-400/50 bg-cyan-500/10',
  },
  amber: {
    background: 'bg-amber-500/10',
    icon: 'theme-metric-amber-icon',
    value: 'theme-metric-amber-value',
    detail: 'theme-metric-amber-detail',
    shadow: 'hover:shadow-[0_0_28px_rgba(251,191,36,0.14)]',
    active: 'border-amber-400/50 bg-amber-500/10',
  },
  fuchsia: {
    background: 'bg-fuchsia-500/10',
    icon: 'theme-metric-fuchsia-icon',
    value: 'theme-metric-fuchsia-value',
    detail: 'theme-metric-fuchsia-detail',
    shadow: 'hover:shadow-[0_0_28px_rgba(217,70,239,0.14)]',
    active: 'border-fuchsia-400/50 bg-fuchsia-500/10',
  },
} as const

function metricTemplates(): Record<string, SystemMetric> {
  return Object.fromEntries(systemMetrics.map((metric) => [metric.id, metric]))
}

function parseStorageGb(value: string): number | null {
  const match = value.trim().match(/^([\d.]+)\s*(TB|GB|MB)/i)
  if (!match) return null
  const amount = parseFloat(match[1])
  if (Number.isNaN(amount)) return null
  const unit = match[2].toUpperCase()
  if (unit === 'TB') return amount * 1024
  if (unit === 'MB') return amount / 1024
  return amount
}

function parseMemoryMb(value: string): number | null {
  const match = value.trim().match(/^([\d.]+)\s*(TB|GB|MB)/i)
  if (!match) return null
  const amount = parseFloat(match[1])
  if (Number.isNaN(amount)) return null
  const unit = match[2].toUpperCase()
  if (unit === 'TB') return amount * 1024 * 1024
  if (unit === 'GB') return amount * 1024
  return amount
}

function parseCpuPercent(cpu: string): number | null {
  const match = cpu.match(/([\d.]+)\s*%/)
  if (!match) return null
  const value = parseFloat(match[1])
  return Number.isNaN(value) ? null : value
}

function parseCpuCores(cpu: string): number | null {
  const match = cpu.match(/(\d+)\s*cores?/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return Number.isNaN(value) ? null : value
}

export function resolveNodeMetrics(node: Node): NodeMetrics | null {
  if (node.metrics) {
    return node.metrics
  }

  if (node.cpu === '—' || node.memory === '—' || node.disk === '—') {
    return null
  }

  const cpuPercent = parseCpuPercent(node.cpu)
  const memoryParts = node.memory.split('/')
  const diskParts = node.disk.split('/')
  const memoryUsedMb = memoryParts[0] ? parseMemoryMb(memoryParts[0]) : null
  const memoryTotalMb = memoryParts[1] ? parseMemoryMb(memoryParts[1]) : null
  const diskUsedGb = diskParts[0] ? parseStorageGb(diskParts[0]) : null
  const diskTotalGb = diskParts[1] ? parseStorageGb(diskParts[1]) : null

  if (
    cpuPercent == null ||
    memoryUsedMb == null ||
    memoryTotalMb == null ||
    diskUsedGb == null ||
    diskTotalGb == null
  ) {
    return null
  }

  return {
    cpuPercent,
    cpuCores: parseCpuCores(node.cpu),
    memoryUsedMb,
    memoryTotalMb,
    diskUsedGb,
    diskTotalGb,
    networkRxMbps: null,
    networkTxMbps: null,
    temperatureC: null,
    uptimeSeconds: null,
  }
}

function isReportingNode(node: Node): boolean {
  if (node.status !== 'online' && node.status !== 'degraded') return false
  return resolveNodeMetrics(node) != null
}

function reportingNodes(nodes: Node[]): Node[] {
  return nodes.filter(isReportingNode)
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function memoryPercent(metrics: NodeMetrics): number {
  if (metrics.memoryTotalMb <= 0) return 0
  return (metrics.memoryUsedMb / metrics.memoryTotalMb) * 100
}

function diskFreeGb(metrics: NodeMetrics): number {
  return Math.max(metrics.diskTotalGb - metrics.diskUsedGb, 0)
}

function diskFreePercent(metrics: NodeMetrics): number {
  if (metrics.diskTotalGb <= 0) return 0
  return (diskFreeGb(metrics) / metrics.diskTotalGb) * 100
}

function formatMemoryDetail(metrics: NodeMetrics): string {
  const usedGb = metrics.memoryUsedMb / 1024
  const totalGb = metrics.memoryTotalMb / 1024
  if (totalGb >= 1) {
    return `${usedGb.toFixed(1)}GB / ${totalGb.toFixed(0)}GB`
  }
  return `${metrics.memoryUsedMb.toFixed(0)}MB / ${metrics.memoryTotalMb.toFixed(0)}MB`
}

function formatUptime(seconds: number): { value: string; detail: string } {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)

  if (days > 0) {
    return {
      value: `${days} day${days === 1 ? '' : 's'}`,
      detail: `${hours}h ${minutes}m`,
    }
  }
  if (hours > 0) {
    return { value: `${hours}h ${minutes}m`, detail: 'since last boot' }
  }
  return { value: `${minutes}m`, detail: 'since last boot' }
}

function metricStatusForNode(nodeStatus: NodeStatus, kind: 'cpu' | 'memory' | 'disk' | 'network' | 'temperature'): 'ok' | 'warning' | 'error' {
  if (nodeStatus === 'offline' || nodeStatus === 'pending') return 'error'
  if (nodeStatus === 'degraded' && (kind === 'memory' || kind === 'temperature')) return 'warning'
  return 'ok'
}

function fleetStatus(values: number[], kind: 'cpu' | 'memory' | 'disk' | 'network' | 'temperature'): 'ok' | 'warning' | 'error' {
  if (values.length === 0) return 'error'
  const average = mean(values)!
  if (kind === 'cpu' && average >= 85) return 'warning'
  if (kind === 'memory' && average >= 85) return 'warning'
  if (kind === 'disk' && average <= 15) return 'warning'
  if (kind === 'temperature' && average >= 80) return 'warning'
  return 'ok'
}

function statsFromValues(values: number[], format: (value: number) => string) {
  return {
    minimum: format(Math.min(...values)),
    maximum: format(Math.max(...values)),
    average: format(mean(values)!),
  }
}

export function formatMetricHistoryValue(metricId: string, value: number): string {
  if (metricId === 'cpu' || metricId === 'memory') return `${Math.round(value)}%`
  if (metricId === 'disk') return `${Math.round(value)}GB`
  if (metricId === 'network') return `${Math.round(value)} Mbps`
  if (metricId === 'temperature') return `${Math.round(value)}°C`
  if (metricId === 'uptime') return formatUptime(Math.round(value)).value
  return String(Math.round(value * 10) / 10)
}

export function statsFromHistory(metricId: string, values: number[]): SystemMetric['stats'] {
  if (values.length === 0) {
    return { minimum: '—', maximum: '—', average: '—' }
  }
  return statsFromValues(values, (value) => formatMetricHistoryValue(metricId, value))
}

function metricHistoryKey(id: string): MetricHistoryKey | null {
  if (
    id === 'cpu' ||
    id === 'memory' ||
    id === 'disk' ||
    id === 'network' ||
    id === 'temperature' ||
    id === 'uptime'
  ) {
    return id
  }
  return null
}

function withHistorySource(
  metric: SystemMetric,
  subjectType: MetricHistorySource['subjectType'],
  subjectId?: string,
): SystemMetric {
  const metricKey = metricHistoryKey(metric.id)
  if (!metricKey) return metric
  return {
    ...metric,
    historySource: { subjectType, subjectId, metricKey },
  }
}

function unavailableMetric(base: SystemMetric, label: string): SystemMetric {
  return {
    ...base,
    value: '—',
    detail: 'unavailable',
    status: 'error',
    summary: `${label} is not reporting ${base.name.toLowerCase()} data.`,
    history: [{ label: 'now', value: 0 }],
    stats: { minimum: '—', maximum: '—', average: '—' },
  }
}

function buildMetricFromValues(
  base: SystemMetric,
  input: {
    value: string
    detail?: string
    status: 'ok' | 'warning' | 'error'
    summary: string
    history: MetricHistoryPoint[]
    stats: SystemMetric['stats']
  },
): SystemMetric {
  return {
    ...base,
    ...input,
  }
}

function buildNodeCpuMetric(node: Node, metrics: NodeMetrics, templates: Record<string, SystemMetric>): SystemMetric {
  const cpuPercent = Math.round(metrics.cpuPercent)
  return withHistorySource(
    buildMetricFromValues(templates.cpu, {
      value: `${cpuPercent}%`,
      detail: metrics.cpuCores ? `${metrics.cpuCores} cores` : 'current load',
      status: metricStatusForNode(node.status, 'cpu'),
      summary: `Processor load on ${node.name}.`,
      history: [{ label: 'now', value: cpuPercent }],
      stats: {
        minimum: `${cpuPercent}%`,
        maximum: `${cpuPercent}%`,
        average: `${cpuPercent}%`,
      },
    }),
    'node',
    node.id,
  )
}

function buildNodeMemoryMetric(node: Node, metrics: NodeMetrics, templates: Record<string, SystemMetric>): SystemMetric {
  const percent = Math.round(memoryPercent(metrics))
  return withHistorySource(
    buildMetricFromValues(templates.memory, {
      value: `${percent}%`,
      detail: formatMemoryDetail(metrics),
      status: metricStatusForNode(node.status, 'memory'),
      summary: `Memory usage on ${node.name}.`,
      history: [{ label: 'now', value: percent }],
      stats: {
        minimum: `${percent}%`,
        maximum: `${percent}%`,
        average: `${percent}%`,
      },
    }),
    'node',
    node.id,
  )
}

function buildNodeDiskMetric(node: Node, metrics: NodeMetrics, templates: Record<string, SystemMetric>): SystemMetric {
  const freeGb = Math.round(diskFreeGb(metrics))
  return withHistorySource(
    buildMetricFromValues(templates.disk, {
      value: `${freeGb}GB`,
      detail: 'free',
      status: metricStatusForNode(node.status, 'disk'),
      summary: `Available storage on ${node.name}.`,
      history: [{ label: 'now', value: freeGb }],
      stats: {
        minimum: `${freeGb}GB`,
        maximum: `${freeGb}GB`,
        average: `${freeGb}GB`,
      },
    }),
    'node',
    node.id,
  )
}

function buildNodeNetworkMetric(node: Node, metrics: NodeMetrics, templates: Record<string, SystemMetric>): SystemMetric {
  if (metrics.networkRxMbps == null) {
    return unavailableMetric(templates.network, node.name)
  }
  const rx = Math.round(metrics.networkRxMbps)
  const tx = metrics.networkTxMbps != null ? Math.round(metrics.networkTxMbps) : null
  return withHistorySource(
    buildMetricFromValues(templates.network, {
      value: `${rx} Mbps`,
      detail: tx != null ? `${tx} Mbps up` : 'download',
      status: metricStatusForNode(node.status, 'network'),
      summary: `Network throughput on ${node.name}.`,
      history: [{ label: 'now', value: rx }],
      stats: {
        minimum: `${rx} Mbps`,
        maximum: `${rx} Mbps`,
        average: `${rx} Mbps`,
      },
    }),
    'node',
    node.id,
  )
}

function buildNodeTemperatureMetric(node: Node, metrics: NodeMetrics, templates: Record<string, SystemMetric>): SystemMetric {
  if (metrics.temperatureC == null) {
    return unavailableMetric(templates.temperature, node.name)
  }
  const temp = Math.round(metrics.temperatureC)
  return withHistorySource(
    buildMetricFromValues(templates.temperature, {
      value: `${temp}°C`,
      detail: temp >= 75 ? 'warm' : 'nominal',
      status: metricStatusForNode(node.status, 'temperature'),
      summary: `Hardware temperature on ${node.name}.`,
      history: [{ label: 'now', value: temp }],
      stats: {
        minimum: `${temp}°C`,
        maximum: `${temp}°C`,
        average: `${temp}°C`,
      },
    }),
    'node',
    node.id,
  )
}

function buildNodeUptimeMetric(node: Node, metrics: NodeMetrics, templates: Record<string, SystemMetric>): SystemMetric {
  if (metrics.uptimeSeconds == null) {
    return unavailableMetric(templates.uptime, node.name)
  }
  const uptime = formatUptime(metrics.uptimeSeconds)
  return withHistorySource(
    buildMetricFromValues(templates.uptime, {
      value: uptime.value,
      detail: uptime.detail,
      status: metricStatusForNode(node.status, 'cpu'),
      summary: `Host uptime on ${node.name}.`,
      history: [{ label: 'now', value: metrics.uptimeSeconds }],
      stats: {
        minimum: uptime.value,
        maximum: uptime.value,
        average: uptime.value,
      },
    }),
    'node',
    node.id,
  )
}

export function getNodeMetrics(node: Node): SystemMetric[] {
  const templates = metricTemplates()
  const metrics = resolveNodeMetrics(node)

  if (!metrics) {
    return systemMetrics.map((metric) => unavailableMetric(metric, node.name))
  }

  return [
    buildNodeCpuMetric(node, metrics, templates),
    buildNodeMemoryMetric(node, metrics, templates),
    buildNodeDiskMetric(node, metrics, templates),
    buildNodeNetworkMetric(node, metrics, templates),
    buildNodeTemperatureMetric(node, metrics, templates),
    buildNodeUptimeMetric(node, metrics, templates),
  ]
}

export function buildFleetMetrics(nodes: Node[]): SystemMetric[] {
  const templates = metricTemplates()
  const sources = reportingNodes(nodes)

  if (sources.length === 0) {
    return systemMetrics.map((metric) => ({
      ...metric,
      value: '—',
      detail: 'no online nodes',
      status: 'warning' as const,
      summary: 'Add an online node to see fleet-wide metrics.',
      history: [{ label: 'now', value: 0 }],
      stats: { minimum: '—', maximum: '—', average: '—' },
    }))
  }

  const metricsList = sources
    .map((node) => ({ node, metrics: resolveNodeMetrics(node)! }))

  const cpuValues = metricsList.map(({ metrics }) => metrics.cpuPercent)
  const memoryValues = metricsList.map(({ metrics }) => memoryPercent(metrics))
  const diskValues = metricsList.map(({ metrics }) => diskFreeGb(metrics))
  const diskPercentValues = metricsList.map(({ metrics }) => diskFreePercent(metrics))
  const networkValues = metricsList
    .map(({ metrics }) => metrics.networkRxMbps)
    .filter((value): value is number => value != null)
  const networkUpValues = metricsList
    .map(({ metrics }) => metrics.networkTxMbps)
    .filter((value): value is number => value != null)
  const temperatureValues = metricsList
    .map(({ metrics }) => metrics.temperatureC)
    .filter((value): value is number => value != null)
  const uptimeValues = metricsList
    .map(({ metrics }) => metrics.uptimeSeconds)
    .filter((value): value is number => value != null)

  const avgCpu = Math.round(mean(cpuValues)!)
  const avgMemory = Math.round(mean(memoryValues)!)
  const avgDiskFree = Math.round(mean(diskValues)!)
  const avgMemoryUsedMb = mean(metricsList.map(({ metrics }) => metrics.memoryUsedMb))!
  const avgMemoryTotalMb = mean(metricsList.map(({ metrics }) => metrics.memoryTotalMb))!
  const memoryDetail = formatMemoryDetail({
    cpuPercent: 0,
    cpuCores: null,
    memoryUsedMb: avgMemoryUsedMb,
    memoryTotalMb: avgMemoryTotalMb,
    diskUsedGb: 0,
    diskTotalGb: 0,
    networkRxMbps: null,
    networkTxMbps: null,
    temperatureC: null,
    uptimeSeconds: null,
  })

  return [
    withHistorySource(
      buildMetricFromValues(templates.cpu, {
        value: `${avgCpu}%`,
        detail: `mean across ${sources.length} node${sources.length === 1 ? '' : 's'}`,
        status: fleetStatus(cpuValues, 'cpu'),
        summary: `Average processor load across ${sources.length} reporting node${sources.length === 1 ? '' : 's'}.`,
        history: metricsList.map(({ node, metrics }) => ({
          label: node.name,
          value: Math.round(metrics.cpuPercent),
        })),
        stats: statsFromValues(cpuValues, (value) => `${Math.round(value)}%`),
      }),
      'fleet',
    ),
    withHistorySource(
      buildMetricFromValues(templates.memory, {
        value: `${avgMemory}%`,
        detail: memoryDetail,
        status: fleetStatus(memoryValues, 'memory'),
        summary: `Average memory usage across ${sources.length} reporting node${sources.length === 1 ? '' : 's'}.`,
        history: metricsList.map(({ node, metrics }) => ({
          label: node.name,
          value: Math.round(memoryPercent(metrics)),
        })),
        stats: statsFromValues(memoryValues, (value) => `${Math.round(value)}%`),
      }),
      'fleet',
    ),
    withHistorySource(
      buildMetricFromValues(templates.disk, {
        value: `${avgDiskFree}GB`,
        detail: 'free',
        status: fleetStatus(diskPercentValues, 'disk'),
        summary: `Average free storage across ${sources.length} reporting node${sources.length === 1 ? '' : 's'}.`,
        history: metricsList.map(({ node, metrics }) => ({
          label: node.name,
          value: Math.round(diskFreeGb(metrics)),
        })),
        stats: statsFromValues(diskValues, (value) => `${Math.round(value)}GB`),
      }),
      'fleet',
    ),
    networkValues.length > 0
      ? withHistorySource(
          buildMetricFromValues(templates.network, {
            value: `${Math.round(mean(networkValues)!)} Mbps`,
            detail: networkUpValues.length > 0
              ? `${Math.round(mean(networkUpValues)!)} Mbps up`
              : 'download',
            status: fleetStatus(networkValues, 'network'),
            summary: `Average network throughput across ${networkValues.length} reporting node${networkValues.length === 1 ? '' : 's'}.`,
            history: metricsList
              .filter(({ metrics }) => metrics.networkRxMbps != null)
              .map(({ node, metrics }) => ({
                label: node.name,
                value: Math.round(metrics.networkRxMbps!),
              })),
            stats: statsFromValues(networkValues, (value) => `${Math.round(value)} Mbps`),
          }),
          'fleet',
        )
      : unavailableMetric(templates.network, 'Fleet'),
    temperatureValues.length > 0
      ? withHistorySource(
          buildMetricFromValues(templates.temperature, {
            value: `${Math.round(mean(temperatureValues)!)}°C`,
            detail: 'nominal',
            status: fleetStatus(temperatureValues, 'temperature'),
            summary: `Average hardware temperature across ${temperatureValues.length} reporting node${temperatureValues.length === 1 ? '' : 's'}.`,
            history: metricsList
              .filter(({ metrics }) => metrics.temperatureC != null)
              .map(({ node, metrics }) => ({
                label: node.name,
                value: Math.round(metrics.temperatureC!),
              })),
            stats: statsFromValues(temperatureValues, (value) => `${Math.round(value)}°C`),
          }),
          'fleet',
        )
      : unavailableMetric(templates.temperature, 'Fleet'),
    uptimeValues.length > 0
      ? (() => {
          const avgUptime = Math.round(mean(uptimeValues)!)
          const uptime = formatUptime(avgUptime)
          return withHistorySource(
            buildMetricFromValues(templates.uptime, {
              value: uptime.value,
              detail: uptime.detail,
              status: 'ok',
              summary: `Average host uptime across ${uptimeValues.length} reporting node${uptimeValues.length === 1 ? '' : 's'}.`,
              history: metricsList
                .filter(({ metrics }) => metrics.uptimeSeconds != null)
                .map(({ node, metrics }) => ({
                  label: node.name,
                  value: metrics.uptimeSeconds!,
                })),
              stats: statsFromValues(uptimeValues, (value) => formatUptime(Math.round(value)).value),
            }),
            'fleet',
          )
        })()
      : unavailableMetric(templates.uptime, 'Fleet'),
  ]
}

function parseServiceMemoryPair(memory: string): { usedMb: number; totalMb: number } | null {
  const parts = memory.split('/').map((part) => part.trim())
  if (parts.length !== 2) return null
  const usedMb = parseMemoryMb(parts[0])
  const totalMb = parseMemoryMb(parts[1])
  if (usedMb == null || totalMb == null) return null
  return { usedMb, totalMb }
}

function serviceMetricStatus(status: ServiceStatus): 'ok' | 'warning' | 'error' {
  if (status === 'running') return 'ok'
  if (status === 'degraded' || status === 'deploying' || status === 'stopping') return 'warning'
  return 'error'
}

function unavailableServiceMetric(
  base: SystemMetric,
  serviceName: string,
  reason: string,
): SystemMetric {
  return {
    ...base,
    value: '—',
    detail: reason,
    status: 'error',
    summary: `${serviceName} is not reporting ${base.name.toLowerCase()} (${reason}).`,
    history: [{ label: 'now', value: 0 }],
    stats: { minimum: '—', maximum: '—', average: '—' },
  }
}

function placeholderServiceMetric(
  base: SystemMetric,
  serviceName: string,
  reason: string,
): SystemMetric {
  return {
    ...base,
    value: '—',
    detail: reason,
    status: 'warning',
    summary: `${serviceName} has no ${base.name.toLowerCase()} data yet (${reason}).`,
    history: [{ label: 'now', value: 0 }],
    stats: { minimum: '—', maximum: '—', average: '—' },
  }
}

export function getServiceMetrics(service: ServiceDetail): SystemMetric[] {
  const templates = metricTemplates()
  const status = serviceMetricStatus(service.status)
  const cpuPercent = parseCpuPercent(service.cpu)
  const memory = parseServiceMemoryPair(service.memory)
  const isActive =
    service.status === 'running' ||
    service.status === 'degraded' ||
    service.status === 'deploying' ||
    service.status === 'stopping'

  const cpuMetric =
    cpuPercent != null
      ? withHistorySource(
          buildMetricFromValues(templates.cpu, {
            value: `${Math.round(cpuPercent)}%`,
            detail: 'container load',
            status,
            summary: `CPU usage for ${service.name}.`,
            history: [{ label: 'now', value: Math.round(cpuPercent) }],
            stats: {
              minimum: `${Math.round(cpuPercent)}%`,
              maximum: `${Math.round(cpuPercent)}%`,
              average: `${Math.round(cpuPercent)}%`,
            },
          }),
          'service',
          service.id,
        )
      : !isActive
        ? unavailableServiceMetric(templates.cpu, service.name, 'not running')
        : placeholderServiceMetric(templates.cpu, service.name, 'awaiting agent')

  const memoryMetric =
    memory != null
      ? withHistorySource(
          buildMetricFromValues(templates.memory, {
            value: `${Math.round((memory.usedMb / memory.totalMb) * 100)}%`,
            detail: service.memory,
            status,
            summary: `Memory usage for ${service.name}.`,
            history: [
              {
                label: 'now',
                value: Math.round((memory.usedMb / memory.totalMb) * 100),
              },
            ],
            stats: {
              minimum: service.memory,
              maximum: service.memory,
              average: service.memory,
            },
          }),
          'service',
          service.id,
        )
      : !isActive
        ? unavailableServiceMetric(templates.memory, service.name, 'not running')
        : placeholderServiceMetric(templates.memory, service.name, 'awaiting agent')

  const uptimeValue = service.uptime?.trim() || '—'
  const uptimeMetric = buildMetricFromValues(templates.uptime, {
    value: uptimeValue,
    detail: isActive ? 'container uptime' : 'last known',
    status,
    summary: `Uptime for ${service.name}.`,
    history: [{ label: 'now', value: isActive ? 100 : 0 }],
    stats: {
      minimum: uptimeValue,
      maximum: uptimeValue,
      average: uptimeValue,
    },
  })

  const restartMetric: SystemMetric = {
    id: 'restarts',
    name: 'Restarts',
    value: String(service.restartCount ?? 0),
    detail: service.restartCount > 0 ? 'since deploy' : 'none recorded',
    status: service.restartCount > 0 ? 'warning' : status,
    icon: RotateCcw,
    color: 'amber',
    unit: '',
    summary: `Container restart count for ${service.name}.`,
    history: [{ label: 'now', value: service.restartCount ?? 0 }],
    stats: {
      minimum: String(service.restartCount ?? 0),
      maximum: String(service.restartCount ?? 0),
      average: String(service.restartCount ?? 0),
    },
  }

  return [cpuMetric, memoryMetric, uptimeMetric, restartMetric]
}
