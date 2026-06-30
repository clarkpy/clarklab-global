import * as React from 'react'
import { pageTextareaClass } from '@/lib/pageInputClasses'
import { cn } from '@/lib/utils'

export const PageTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(function PageTextarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(pageTextareaClass(), className)} {...props} />
})
