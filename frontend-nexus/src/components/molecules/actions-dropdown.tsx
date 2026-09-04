import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MoreVertical } from 'lucide-react';
import * as React from 'react';

export type ActionItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  separatorBefore?: boolean;
  /** Optional disabled state for actions gated by business rules (e.g. missing signatures). */
  disabled?: boolean;
};

export type ActionsDropdownProps = {
  actions: ActionItem[];
  trigger?: 'button' | 'icon';
  align?: 'start' | 'center' | 'end';
  className?: string;
};

export function ActionsDropdown({
  actions,
  trigger = 'button',
  align = 'end',
  className,
}: ActionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-muted-foreground size-8 data-[state=open]:bg-muted flex',
              className
            )}
          >
            <MoreVertical className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-muted-foreground size-8 data-[state=open]:bg-muted flex',
              className
            )}
          >
            <MoreVertical className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {actions.map((action, index) => (
          <React.Fragment key={index}>
            {action.separatorBefore && index > 0 && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem
              variant={action.variant}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
