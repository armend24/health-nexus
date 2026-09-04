import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function StandardTable({
  children,
  minWidthClass = 'min-w-[700px]',
}: {
  children: ReactNode;
  minWidthClass?: string;
}) {
  return <Table className={minWidthClass}>{children}</Table>;
}

export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-nowrap items-center gap-2">
      {children}
    </div>
  );
}

export function RowIconActionButton({
  mode,
  label,
  onClick,
  disabled,
}: {
  mode: 'edit' | 'delete';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={mode === 'delete' ? 'destructive' : 'ghost'}
      size="icon-sm"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {mode === 'delete' ? <IconTrash /> : <IconPencil />}
    </Button>
  );
}

export function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function Field({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={['space-y-2', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
