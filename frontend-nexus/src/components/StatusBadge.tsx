import { cn } from '@/lib/utils';

export type AppointmentStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED';

const statusColor: Record<AppointmentStatus, string> = {
  REQUESTED: 'bg-muted text-muted-foreground border border-border',
  CONFIRMED: 'bg-primary/10 text-primary border border-primary/20',
  COMPLETED:
    'bg-green-500/10 text-green-400 border border-green-500/20',
  CANCELLED:
    'bg-destructive/10 text-destructive border border-destructive/20',
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded px-2 py-1 text-xs font-semibold',
        statusColor[status],
        className
      )}
    >
      {status}
    </span>
  );
}
