import type { Project } from '@/lib/domainTypes'

const STATIC_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/projects': 'Projects',
  '/dashboard/services': 'Services',
  '/dashboard/teams': 'Teams',
  '/dashboard/nodes': 'Nodes',
  '/dashboard/logs': 'Logs',
  '/dashboard/settings': 'Settings',
  '/dashboard/account': 'Account',
  '/dashboard/access-denied': 'Access denied',
  '/dashboard/admin/users': 'Users',
}

export function getPageTitle(
  pathname: string,
  projects: Project[] = [],
  mobileDetailTitle: string | null = null,
): string {
  if (mobileDetailTitle && pathname.match(/^\/dashboard\/(services|nodes|teams|admin\/users)\/[^/]+$/)) {
    return mobileDetailTitle
  }
  if (STATIC_TITLES[pathname]) {
    return STATIC_TITLES[pathname]
  }

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)$/)
  if (projectMatch) {
    const project = projects.find((item) => item.id === projectMatch[1])
    return project?.name ?? 'Project'
  }

  if (pathname.startsWith('/dashboard/services/')) return 'Service'
  if (pathname.startsWith('/dashboard/nodes/')) return 'Node'
  if (pathname.startsWith('/dashboard/teams/')) return 'Team'
  if (pathname.startsWith('/dashboard/admin/users/')) return 'User'

  return 'Dashboard'
}
