import { cva, type VariantProps } from 'class-variance-authority';
import {
  AlertTriangle,
  CheckCircle,
  CircleHelp,
  XCircle,
} from 'lucide-react';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const VARIANT_ICONS = {
  success: CheckCircle,
  destructive: XCircle,
  warning: AlertTriangle,
  neutral: CircleHelp,
} as const;

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'bg-secondary/30 text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive/30 text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        success:
          'bg-success/30 text-success [a&]:hover:bg-success/90',
        neutral: 'bg-neutral/30 text-white [a&]:hover:bg-neutral/90',
        expired:
          'bg-red-500/15 text-red-600 dark:bg-red-500/25 dark:text-red-400 [a&]:hover:bg-red-500/30',
        warning:
          'bg-warning/30 text-warning [a&]:hover:bg-warning/90',
        sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
        emerald:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
        amber:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
        rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
        violet:
          'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200',
        cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200',
        outline:
          'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        ghost:
          '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type BadgeColor = 'success' | 'destructive' | 'neutral';

function Badge({
  className,
  variant,
  color,
  asChild = false,
  showIcon = true,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Shorthand for variant: maps to success, destructive, or neutral */
    color?: BadgeColor;
    /** Show icon for success, destructive, warning variants (default: true) */
    showIcon?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'span';
  const resolvedVariant = color ?? variant ?? 'default';
  const showVariantIcon =
    showIcon && !asChild && resolvedVariant in VARIANT_ICONS;
  const Icon = showVariantIcon
    ? VARIANT_ICONS[resolvedVariant as keyof typeof VARIANT_ICONS]
    : null;

  return (
    <Comp
      data-slot="badge"
      data-variant={resolvedVariant}
      className={cn(
        badgeVariants({
          variant: resolvedVariant,
        }),
        className
      )}
      {...props}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
