import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { pageInputClass } from "@/lib/pageInputClasses"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(pageInputClass(undefined, type), className)}
      {...props}
    />
  )
}

export { Input }
