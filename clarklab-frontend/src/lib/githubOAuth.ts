import { getDefaultGitHubOAuthCallbackUrl } from '@/lib/accountDialog'

export function getGitHubOAuthRedirectUri(): string {
  return getDefaultGitHubOAuthCallbackUrl()
}
