import { TenantStatus } from '@/interfaces';
import {
  Archive,
  CheckCircle,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import type { ComponentType } from 'react';

export const TENANTS_QUERY_KEY = ['tenants'] as const;

export const STATUS_TABS = [
  {
    value: TenantStatus.PENDING,
    label: 'Pending',
  },
  {
    value: TenantStatus.APPROVED,
    label: 'Approved',
  },
  {
    value: TenantStatus.REJECTED,
    label: 'Rejected',
  },
  {
    value: TenantStatus.SUSPENDED,
    label: 'Suspended',
  },
  {
    value: TenantStatus.ARCHIVED,
    label: 'Archived',
  },
] as const;

export type StatusActionDef = {
  target: TenantStatus;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  variant?: 'destructive';
};

export const STATUS_ACTIONS: Record<TenantStatus, StatusActionDef[]> =
  {
    [TenantStatus.PENDING]: [
      {
        target: TenantStatus.APPROVED,
        label: 'Approve',
        Icon: CheckCircle,
      },
      {
        target: TenantStatus.REJECTED,
        label: 'Reject',
        Icon: XCircle,
        variant: 'destructive',
      },
    ],
    [TenantStatus.APPROVED]: [
      {
        target: TenantStatus.SUSPENDED,
        label: 'Suspend',
        Icon: PauseCircle,
        variant: 'destructive',
      },
      {
        target: TenantStatus.ARCHIVED,
        label: 'Archive',
        Icon: Archive,
        variant: 'destructive',
      },
    ],
    [TenantStatus.SUSPENDED]: [
      {
        target: TenantStatus.APPROVED,
        label: 'Approve',
        Icon: CheckCircle,
      },
      {
        target: TenantStatus.ARCHIVED,
        label: 'Archive',
        Icon: Archive,
        variant: 'destructive',
      },
    ],
    [TenantStatus.REJECTED]: [
      {
        target: TenantStatus.ARCHIVED,
        label: 'Archive',
        Icon: Archive,
        variant: 'destructive',
      },
    ],
    [TenantStatus.ARCHIVED]: [],
  };

export const ICON_SIZE = {
  className: 'size-4 shrink-0',
} as const;
