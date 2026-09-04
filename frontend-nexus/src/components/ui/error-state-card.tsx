import { AlertTriangle } from 'lucide-react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ErrorStateCardProps {
  title: string;
  message: string;
  className?: string;
}

export function ErrorStateCard({
  title,
  message,
  className,
}: ErrorStateCardProps) {
  return (
    <Card
      className={cn(
        'border-destructive/30 bg-destructive/5 shadow-sm',
        className
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-2 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-destructive">
              {title}
            </CardTitle>
            <CardDescription className="text-destructive/85">
              {message}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
