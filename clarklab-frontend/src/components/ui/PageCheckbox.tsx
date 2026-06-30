import * as React from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pageControlPillClass } from '@/lib/pageInputClasses'

const checkboxSizes = {
  default: 'h-5 w-5 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5',
  sm: 'h-4 w-4 rounded [&_svg]:h-3 [&_svg]:w-3',
} as const

export type PageCheckboxSize = keyof typeof checkboxSizes

const checkboxBoxClass = cn(
  pageControlPillClass,
  'inline-flex shrink-0 items-center justify-center data-checked:border-violet-400 data-checked:bg-gradient-to-br data-checked:from-purple-600 data-checked:to-purple-500 data-checked:text-white data-checked:shadow-[0_0_14px_rgba(168,85,247,0.35)]',
)

export interface PageCheckboxProps {
  id?: string
  name?: string
  value?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  required?: boolean
  className?: string
  size?: PageCheckboxSize
}

export function PageCheckbox({
  id,
  name,
  value,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  required,
  className,
  size = 'default',
}: PageCheckboxProps) {
  return (
    <Checkbox.Root
      id={id}
      name={name}
      value={value}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      required={required}
      className={cn(checkboxBoxClass, checkboxSizes[size], className)}
    >
      <Checkbox.Indicator
        keepMounted
        className="flex items-center justify-center transition duration-150 data-unchecked:scale-75 data-unchecked:opacity-0 data-checked:scale-100 data-checked:opacity-100"
      >
        <Check aria-hidden="true" strokeWidth={3} />
      </Checkbox.Indicator>
    </Checkbox.Root>
  )
}

export interface PageCheckboxFieldProps extends PageCheckboxProps {
  label: React.ReactNode
  description?: React.ReactNode
  align?: 'start' | 'center'
  className?: string
  labelClassName?: string
}

export function PageCheckboxField({
  label,
  description,
  align = 'center',
  className,
  labelClassName,
  id,
  size = 'default',
  ...checkboxProps
}: PageCheckboxFieldProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'flex cursor-pointer gap-3',
        align === 'start' ? 'items-start' : 'items-center',
        disabledLabelClass(checkboxProps.disabled),
        className,
      )}
    >
      <PageCheckbox
        id={fieldId}
        size={size}
        className={align === 'start' ? 'mt-0.5' : undefined}
        {...checkboxProps}
      />
      <span className="min-w-0">
        <span className={cn('theme-subheading leading-6', labelClassName)}>{label}</span>
        {description ? (
          <span className="theme-muted mt-1 block text-xs leading-5">{description}</span>
        ) : null}
      </span>
    </label>
  )
}

function disabledLabelClass(disabled?: boolean) {
  return disabled ? 'cursor-not-allowed opacity-60' : undefined
}
