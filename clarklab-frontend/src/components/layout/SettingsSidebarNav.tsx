import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Settings, type LucideIcon } from 'lucide-react'
import {
  buildSettingsNavItems,
  resolveActiveSettingsSection,
  settingsSectionPath,
} from '@/lib/settingsNav'
import { cn } from '@/lib/utils'

interface SettingsSidebarNavProps {
  isSysadmin?: boolean
  onNavigate?: () => void
}

function SettingsSubLink({
  to,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50',
        active ? 'theme-nav-active' : 'theme-nav-item',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  )
}

export function SettingsSidebarNav({ isSysadmin = false, onNavigate }: SettingsSidebarNavProps) {
  const location = useLocation()
  const isOnSettings = location.pathname === '/dashboard/settings'
  const navItems = useMemo(() => buildSettingsNavItems(isSysadmin), [isSysadmin])
  const validIds = useMemo(() => navItems.map((item) => item.id), [navItems])
  const activeSection = resolveActiveSettingsSection(location.hash, validIds)
  const [open, setOpen] = useState(isOnSettings)

  useEffect(() => {
    if (isOnSettings) setOpen(true)
  }, [isOnSettings])

  return (
    <div>
      <div className="flex items-center gap-1">
        <NavLink
          to="/dashboard/settings"
          end
          onClick={() => {
            setOpen(true)
            onNavigate?.()
          }}
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50',
              isActive || isOnSettings ? 'theme-nav-active' : 'theme-nav-item',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Settings</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="theme-muted rounded-xl p-2 transition hover:bg-violet-500/10 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400/50 light:hover:text-violet-700"
          aria-expanded={open}
          aria-label={open ? 'Collapse settings sections' : 'Expand settings sections'}
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', open ? 'rotate-180' : '')}
            aria-hidden="true"
          />
        </button>
      </div>

      {open ? (
        <div className="theme-border-subtle ml-5 mt-1 space-y-0.5 border-l pl-3">
          {navItems.map((item) => (
            <SettingsSubLink
              key={item.id}
              to={settingsSectionPath(item.id)}
              label={item.label}
              icon={item.icon}
              active={isOnSettings && activeSection === item.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
