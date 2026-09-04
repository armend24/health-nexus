import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  label?: string;
}

export function LoadingSpinner({
  className,
  label = 'Loading',
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        'flex min-h-96 items-center justify-center px-6 py-10',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center gap-4">
        <div className="absolute inset-x-6 top-4 h-16 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl border border-border/60 bg-background/95 shadow-lg shadow-black/5">
          <div className="absolute inset-2 rounded-2xl border border-dashed border-primary/20" />
          <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-primary/8 via-transparent to-transparent" />
          <Loader2Icon className="relative z-10 size-8 animate-spin text-primary" />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-foreground">
            {label}
          </p>
          <p className="text-xs text-muted-foreground">
            Preparing your content
          </p>
        </div>
      </div>
    </div>
  );
}
