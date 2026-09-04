import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { isApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { getSubscriptionStats } from '@/services/subscription-plans.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  IconLock,
  IconSparkles,
  type Icon,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

interface FeatureUnavailableCardProps {
  title: string;
  description: string;
  featureLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: Icon;
  className?: string;
  footer?: ReactNode;
  showCurrentPlan?: boolean;
}

export function FeatureUnavailableCard({
  title,
  description,
  featureLabel,
  actionLabel,
  onAction,
  icon: Icon = IconSparkles,
  className,
  footer,
  showCurrentPlan = false,
}: FeatureUnavailableCardProps) {
  const role = useAuthStore((state) => state.role);
  const shouldLoadPlan = showCurrentPlan && role === 'TENANT_MANAGER';

  const currentPlanQuery = useQuery({
    queryKey: ['subscription', 'stats'],
    queryFn: () => getSubscriptionStats(),
    enabled: shouldLoadPlan,
  });

  const currentPlanLabel = shouldLoadPlan
    ? currentPlanQuery.isLoading
      ? 'Current plan: loading...'
      : currentPlanQuery.isError
        ? isApiError(currentPlanQuery.error) &&
          currentPlanQuery.error.status === 404
          ? 'Current plan: no active plan'
          : 'Current plan: unavailable'
        : `Current plan: ${currentPlanQuery.data.current_plan_name}`
    : null;

  return (
    <Card className={cn('overflow-hidden border-dashed', className)}>
      <CardHeader className="relative">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-3">
        {featureLabel ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
            <IconLock className="size-3.5" />
            {featureLabel}
          </div>
        ) : null}
        {currentPlanLabel ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
            {currentPlanLabel}
          </div>
        ) : null}

        {actionLabel && onAction ? (
          <Button size="sm" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}

        {footer}
      </CardContent>
    </Card>
  );
}
