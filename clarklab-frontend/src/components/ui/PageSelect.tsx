import * as React from 'react'
import { Select } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pageControlPanelClass, pageControlPillClass } from '@/lib/pageInputClasses'

export type PageSelectOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

const triggerSizes = {
  form: 'h-11 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold',
  filter: 'min-w-[10rem] rounded-full px-4 py-2.5 text-sm font-semibold',
  compact: 'rounded-full px-3 py-1.5 text-sm font-semibold',
  inline: 'min-w-[8rem] rounded-xl px-3 py-2 text-xs font-semibold',
} as const

export type PageSelectSize = keyof typeof triggerSizes

const triggerBase = cn(
  pageControlPillClass,
  'group inline-flex items-center justify-between gap-2 text-left data-popup-open:border-violet-400/45 data-popup-open:shadow-[0_0_20px_rgba(168,85,247,0.18)] light:hover:text-violet-800',
)

export interface PageSelectProps {
  id?: string
  name?: string
  value: string
  onValueChange: (value: string) => void
  options: PageSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: PageSelectSize
  'aria-label'?: string
}

export function PageSelect({
  id,
  name,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  size = 'form',
  'aria-label': ariaLabel,
}: PageSelectProps) {
  const items = React.useMemo(
    () => options.map((option) => ({ value: option.value, label: option.label })),
    [options],
  )

  return (
    <Select.Root
      name={name}
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next != null) onValueChange(String(next))
      }}
      disabled={disabled}
      modal={false}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(triggerBase, triggerSizes[size], className)}
      >
        <Select.Value placeholder={placeholder} className="truncate" />
        <Select.Icon className="text-violet-300/80 transition-transform duration-200 group-data-popup-open:rotate-180 light:text-violet-600">
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          alignItemWithTrigger={false}
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Select.Popup className={cn('page-select-popup min-w-[var(--anchor-width)] overflow-hidden rounded-2xl p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] light:shadow-[0_16px_48px_rgba(124,58,237,0.14)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:slide-out-to-top-1', pageControlPanelClass)}>
            <Select.List className="page-select-list max-h-64 overflow-y-auto outline-none">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  label={typeof option.label === 'string' ? option.label : option.value}
                  className={cn(
                    'page-select-item flex cursor-default items-center gap-2 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors duration-150',
                    'data-highlighted:bg-violet-500/15 data-highlighted:text-violet-100 light:data-highlighted:bg-violet-100 light:data-highlighted:text-violet-900',
                    'data-selected:font-semibold',
                    'data-disabled:pointer-events-none data-disabled:opacity-40',
                  )}
                >
                  <Select.ItemIndicator className="flex h-4 w-4 shrink-0 items-center justify-center text-violet-400 light:text-violet-600">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="flex-1 truncate">{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
