import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import {
  pageButtonClass,
  type pageButtonSizes,
  type pageButtonVariants,
} from '@/lib/pageButtonClasses'

type PageButtonVariant = keyof typeof pageButtonVariants
type PageButtonSize = keyof typeof pageButtonSizes

export interface PageButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PageButtonVariant
  size?: PageButtonSize
}

export const PageButton = forwardRef<HTMLButtonElement, PageButtonProps>(function PageButton(
  { variant = 'primary', size = 'default', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={pageButtonClass(variant, size, className)}
      {...props}
    />
  )
})

export function PageLink({
  variant = 'primary',
  size = 'default',
  className,
  ...props
}: LinkProps & { variant?: PageButtonVariant; size?: PageButtonSize }) {
  return <Link className={pageButtonClass(variant, size, className)} {...props} />
}
