import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Reveal } from '@/components/layout/Reveal'
import { SettingsSectionTag } from '@/components/SettingsSectionTag'
import { AccountProfileSection } from '@/components/AccountProfileSection'
import { AccountGitHubSection } from '@/components/AccountGitHubSection'
import { useAccountOAuthCallback } from '@/lib/useAccountOAuthCallback'

export default function AccountPage() {
  const [githubRefreshKey, setGithubRefreshKey] = useState(0)

  const handleOAuthConnected = useCallback(() => {
    setGithubRefreshKey((value) => value + 1)
  }, [])

  useAccountOAuthCallback({ onConnected: handleOAuthConnected })

  return (
    <div className="relative">
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <Reveal delay={0}>
          <div className="mb-8 max-w-2xl">
            <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Account</h1>
            <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
              Profile, password, and GitHub connection for deploys. Platform OAuth is configured in{' '}
              <Link to="/dashboard/settings" className="font-semibold text-violet-400 hover:text-violet-300 light:hover:text-violet-700">
                Settings
              </Link>
              .
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal delay={100}>
            <Card className="h-full p-6">
              <CardHeader className="mb-6 p-0">
                <SettingsSectionTag section="account" />
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your email and password.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <AccountProfileSection />
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={145}>
            <Card className="h-full p-6" key={githubRefreshKey}>
              <CardHeader className="mb-6 p-0">
                <SettingsSectionTag section="integrations" />
                <CardTitle>GitHub</CardTitle>
                <CardDescription>Required to deploy private git repositories.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <AccountGitHubSection />
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
