import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchDashboardSummary,
  fetchNodes,
  fetchProjects,
  fetchServiceById,
  fetchServiceEnvironment,
  fetchServices,
  fetchTeam,
  fetchPlatformUser,
  saveServiceEnvironment,
  saveServiceSettings,
  type ServiceSettingsInput,
  type ServiceEnvVar,
} from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'

export function useNodesQuery(projectId?: string) {
  return useQuery({
    queryKey: projectId ? [...queryKeys.nodes, projectId] : queryKeys.nodes,
    queryFn: () => fetchNodes(projectId),
  })
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: fetchProjects,
  })
}

export function useServicesQuery(environment?: string) {
  const envKey =
    environment === 'development' || environment === 'production' ? environment : 'all'
  return useQuery({
    queryKey: [...queryKeys.services, envKey],
    queryFn: () => fetchServices(environment),
  })
}

export function useServiceQuery(serviceId: string | undefined, environment?: string) {
  return useQuery({
    queryKey: serviceId ? queryKeys.service(serviceId, environment) : ['services', 'missing'],
    queryFn: () => fetchServiceById(serviceId!, environment),
    enabled: Boolean(serviceId),
  })
}

export function useServiceEnvVarsQuery(serviceId: string | undefined) {
  return useQuery({
    queryKey: serviceId ? ['services', serviceId, 'env-vars'] : ['services', 'missing', 'env-vars'],
    queryFn: () => fetchServiceEnvironment(serviceId!),
    enabled: Boolean(serviceId),
  })
}

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: fetchDashboardSummary,
  })
}

export function useTeamQuery(teamId: string | undefined) {
  return useQuery({
    queryKey: teamId ? ['teams', teamId] : ['teams', 'missing'],
    queryFn: () => fetchTeam(teamId!),
    enabled: Boolean(teamId),
  })
}

export function usePlatformUserQuery(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: userId ? ['users', userId] : ['users', 'missing'],
    queryFn: () => fetchPlatformUser(userId!),
    enabled: Boolean(userId) && enabled,
  })
}

export function useSaveServiceSettings(serviceId: string | undefined, environment?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: ServiceSettingsInput) => saveServiceSettings(serviceId!, settings),
    onSuccess: () => {
      if (!serviceId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.service(serviceId, environment) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.services })
    },
  })
}

export function useSaveEnvVars(serviceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: ServiceEnvVar[]) => saveServiceEnvironment(serviceId!, variables),
    onSuccess: () => {
      if (!serviceId) return
      void queryClient.invalidateQueries({ queryKey: ['services', serviceId, 'env-vars'] })
    },
  })
}
