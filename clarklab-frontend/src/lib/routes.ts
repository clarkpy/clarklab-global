export const DEPLOY_SERVICE_PATH = '/dashboard/services?new=1'

export function deployServicePath(templateId?: string): string {
  if (!templateId) return DEPLOY_SERVICE_PATH
  return `${DEPLOY_SERVICE_PATH}&template=${encodeURIComponent(templateId)}`
}
