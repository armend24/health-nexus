import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

export interface CalendarProps {
  mode?: 'single';
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  initialFocus?: boolean;
  disabled?: (date: Date) => boolean;
  className?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function Calendar({
  selected,
  onSelect,
  disabled,
  className,
}: CalendarProps) {
  const [viewDate, setViewDate] = React.useState(() => {
    if (selected)
      return new Date(selected.getFullYear(), selected.getMonth(), 1);
    return new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  const monthName = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className={cn('w-full select-none', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-foreground">
          {monthName}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {DAYS.map((d) => (
          <div
            key={d}
            className="flex h-8 items-center justify-center"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {d}
            </span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-9" />;
          }

          const cellDate = new Date(year, month, day);
          const isSelected = selected
            ? isSameDay(cellDate, selected)
            : false;
          const isToday = isSameDay(cellDate, today);
          const isDisabled = disabled ? disabled(cellDate) : false;

          return (
            <div
              key={day}
              className="flex items-center justify-center p-0.5"
            >
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    onSelect?.(isSelected ? undefined : cellDate);
                  }
                }}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isDisabled && 'pointer-events-none opacity-30',
                  isSelected &&
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                  !isSelected &&
                    isToday &&
                    'border border-primary/50 text-primary font-semibold',
                  !isSelected && !isToday && 'text-foreground'
                )}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
