import { Database, GitBranch } from 'lucide-react'
import type { ServiceSourceType } from '@/lib/domainTypes'

export interface ServiceTemplateStorage {
  mountPath: string
  defaultSizeGb: number
  label: string
}

export interface ServiceTemplate {
  id: string
  name: string
  description: string
  sourceType: ServiceSourceType
  category: 'database' | 'git'
  type: string
  image: string
  defaultPort: number
  portLabel?: string
  storage: ServiceTemplateStorage
  defaultEnvVars: Array<{ key: string; value: string; isSecret: boolean }>
}

export const SERVICE_TEMPLATE_CATEGORIES = [
  { id: 'database' as const, label: 'Database', icon: Database },
  { id: 'git' as const, label: 'Git repository', icon: GitBranch },
]

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Relational database for apps, APIs, and analytics.',
    sourceType: 'database',
    category: 'database',
    type: 'PostgreSQL',
    image: 'postgres:16-alpine',
    defaultPort: 5432,
    storage: {
      mountPath: '/var/lib/postgresql/data',
      defaultSizeGb: 10,
      label: 'Database files',
    },
    defaultEnvVars: [
      { key: 'POSTGRES_USER', value: 'clarklab', isSecret: false },
      { key: 'POSTGRES_PASSWORD', value: '', isSecret: true },
      { key: 'POSTGRES_DB', value: 'app', isSecret: false },
    ],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Document database for flexible JSON workloads.',
    sourceType: 'database',
    category: 'database',
    type: 'MongoDB',
    image: 'mongo:7',
    defaultPort: 27017,
    storage: {
      mountPath: '/data/db',
      defaultSizeGb: 10,
      label: 'Database files',
    },
    defaultEnvVars: [
      { key: 'MONGO_INITDB_ROOT_USERNAME', value: 'clarklab', isSecret: false },
      { key: 'MONGO_INITDB_ROOT_PASSWORD', value: '', isSecret: true },
      { key: 'MONGO_INITDB_DATABASE', value: 'app', isSecret: false },
    ],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Popular SQL database for web apps and services.',
    sourceType: 'database',
    category: 'database',
    type: 'MySQL',
    image: 'mysql:8',
    defaultPort: 3306,
    storage: {
      mountPath: '/var/lib/mysql',
      defaultSizeGb: 10,
      label: 'Database files',
    },
    defaultEnvVars: [
      { key: 'MYSQL_ROOT_PASSWORD', value: '', isSecret: true },
      { key: 'MYSQL_DATABASE', value: 'app', isSecret: false },
      { key: 'MYSQL_USER', value: 'clarklab', isSecret: false },
      { key: 'MYSQL_PASSWORD', value: '', isSecret: true },
    ],
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'In-memory cache, queues, and session store.',
    sourceType: 'database',
    category: 'database',
    type: 'Redis',
    image: 'redis:7-alpine',
    defaultPort: 6379,
    storage: {
      mountPath: '/data',
      defaultSizeGb: 2,
      label: 'Persistence volume',
    },
    defaultEnvVars: [],
  },
  {
    id: 'git-repo',
    name: 'Git repository',
    description: 'Deploy from a GitHub or GitLab repo. Build and run on your node.',
    sourceType: 'git',
    category: 'git',
    type: 'Git App',
    image: '',
    defaultPort: 3000,
    storage: {
      mountPath: '/app/data',
      defaultSizeGb: 5,
      label: 'App data (uploads, local files)',
    },
    defaultEnvVars: [{ key: 'NODE_ENV', value: 'production', isSecret: false }],
  },
]

export function getServiceTemplate(id: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((template) => template.id === id)
}

export function templatesForCategory(category: 'database' | 'git'): ServiceTemplate[] {
  return SERVICE_TEMPLATES.filter((template) => template.category === category)
}

export function generateDefaultPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export function buildEnvVarsFromTemplate(
  template: ServiceTemplate,
  overrides: Record<string, string>,
): Array<{ key: string; value: string; isSecret: boolean }> {
  return template.defaultEnvVars.map((row) => {
    let value = overrides[row.key] ?? row.value
    if (row.isSecret && !value) {
      value = generateDefaultPassword()
    }
    return { ...row, value }
  })
}
