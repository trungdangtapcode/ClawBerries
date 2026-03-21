import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        hired: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
        pending: "bg-primary-fixed text-on-primary-fixed-variant",
        rejected: "bg-error-container text-on-error-container",
        default: "bg-surface-container-high text-on-surface-variant",
        secondary: "bg-secondary-container text-on-secondary-container",
        info: "bg-primary-fixed-dim/20 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
