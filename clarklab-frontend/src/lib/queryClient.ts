import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
    },
  },
})

export const queryKeys = {
  nodes: ['nodes'] as const,
  node: (id: string) => ['nodes', id] as const,
  nodeServices: (id: string) => ['nodes', id, 'services'] as const,
  projects: ['projects'] as const,
  services: ['services'] as const,
  service: (id: string, env?: string) => ['services', id, env ?? 'production'] as const,
  logs: (filters?: Record<string, string | undefined>) => ['logs', filters] as const,
  serviceLogs: (serviceId: string) => ['services', serviceId, 'logs'] as const,
  dashboard: ['dashboard', 'summary'] as const,
}
