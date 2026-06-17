import { useQuery } from '@tanstack/react-query'
import { fetchNodes, fetchProjects, fetchServices } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'

export function useNodesQuery() {
  return useQuery({
    queryKey: queryKeys.nodes,
    queryFn: () => fetchNodes(),
  })
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: fetchProjects,
  })
}

export function useServicesQuery() {
  return useQuery({
    queryKey: queryKeys.services,
    queryFn: fetchServices,
  })
}
