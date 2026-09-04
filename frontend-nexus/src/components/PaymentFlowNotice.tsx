import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface PaymentFlowNoticeAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  loading?: boolean;
}

interface PaymentFlowNoticeProps {
  phase:
    | 'collecting_payment'
    | 'processing'
    | 'awaiting_approval'
    | 'attention_required';
  eyebrow?: string;
  title: string;
  description: string;
  primaryAction?: PaymentFlowNoticeAction;
  secondaryAction?: PaymentFlowNoticeAction;
  className?: string;
}

const phaseConfig = {
  collecting_payment: {
    badgeVariant: 'secondary' as const,
    badgeLabel: 'Checkout ready',
  },
  processing: {
    badgeVariant: 'default' as const,
    badgeLabel: 'Awaiting confirmation',
  },
  awaiting_approval: {
    badgeVariant: 'secondary' as const,
    badgeLabel: 'Awaiting super admin approval',
  },
  attention_required: {
    badgeVariant: 'warning' as const,
    badgeLabel: 'Needs attention',
  },
};

export function PaymentFlowNotice({
  phase,
  eyebrow = 'Payment status',
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: PaymentFlowNoticeProps) {
  const config = phaseConfig[phase];

  return (
    <Card
      className={`border-border/70 bg-card/80 py-0 shadow-sm ${
        className ?? ''
      }`}
    >
      <CardHeader className="gap-3 border-b border-border/60 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </div>
            <CardTitle className="text-base sm:text-lg">
              {title}
            </CardTitle>
            <CardDescription className="max-w-3xl leading-6">
              {description}
            </CardDescription>
          </div>
          <Badge variant={config.badgeVariant}>
            {config.badgeLabel}
          </Badge>
        </div>
      </CardHeader>
      {(primaryAction || secondaryAction) && (
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:justify-end">
          {secondaryAction ? (
            <Button
              variant={secondaryAction.variant ?? 'outline'}
              onClick={secondaryAction.onClick}
              loading={secondaryAction.loading}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          {primaryAction ? (
            <Button
              variant={primaryAction.variant ?? 'default'}
              onClick={primaryAction.onClick}
              loading={primaryAction.loading}
            >
              {primaryAction.label}
            </Button>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
