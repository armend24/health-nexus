/**
 * FUL-278: Feature Flag Engine — frontend tests
 *
 * Covers:
 * 1. useFeatureFlag returns enabled=true when the API resolves the flag as enabled.
 * 2. useFeatureFlag returns enabled=false when the flag is disabled.
 * 3. useFeatureFlag returns enabled=false on API error (safe default).
 * 4. Flag starts in loading=true and transitions to loading=false after resolution.
 * 5. FeatureGate component renders children when flag is enabled, hides them when disabled.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import '@testing-library/jest-dom';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';

import { FeatureGate } from '@/components/FeatureGate';
import { TenantFeatureGuard } from '@/components/TenantFeatureGuard';
import { useAuthStore } from '@/stores/auth.store';
import { useFeatureFlagsStore } from '@/stores/feature-flags.store';
import { useFeatureFlag } from '@/stores/use-feature-flag';

type FlagBehavior =
  | {
      kind: 'success';
      enabled: boolean;
      tenantId?: number;
    }
  | {
      kind: 'reject';
      message: string;
    }
  | {
      kind: 'pending';
    }
  | {
      kind: 'deferred';
      resolve?: (res: Response) => void;
    };

const flagBehaviors: Record<string, FlagBehavior> = {};

function setFlagSuccess(
  featureKey: string,
  enabled: boolean,
  tenantId = 1
) {
  flagBehaviors[featureKey] = {
    kind: 'success',
    enabled,
    tenantId,
  };
}

function setFlagReject(featureKey: string, message: string) {
  flagBehaviors[featureKey] = {
    kind: 'reject',
    message,
  };
}

function setFlagPending(featureKey: string) {
  flagBehaviors[featureKey] = { kind: 'pending' };
}

function setFlagDeferred(
  featureKey: string
): (enabled: boolean, tenantId?: number) => void {
  const behavior: FlagBehavior = { kind: 'deferred' };
  flagBehaviors[featureKey] = behavior;
  return (enabled: boolean, tenantId = 1) => {
    if (behavior.kind !== 'deferred' || !behavior.resolve) return;
    behavior.resolve(
      new Response(
        JSON.stringify({
          feature_key: featureKey,
          enabled,
          tenant_id: tenantId,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );
  };
}

function installFeatureFlagFetchMock() {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const rawUrl =
      typeof input === 'string' ? input : input.toString();
    const marker = '/api/feature-flags/';
    const idx = rawUrl.indexOf(marker);
    if (idx === -1) {
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const featureKey = decodeURIComponent(
      rawUrl.slice(idx + marker.length).split('?')[0]
    );
    const behavior = flagBehaviors[featureKey] ?? {
      kind: 'success',
      enabled: false,
      tenantId: 1,
    };

    if (behavior.kind === 'reject') {
      throw new Error(behavior.message);
    }
    if (behavior.kind === 'pending') {
      return new Promise(() => {}) as Promise<Response>;
    }
    if (behavior.kind === 'deferred') {
      return new Promise((resolve) => {
        behavior.resolve = resolve;
      });
    }

    return new Response(
      JSON.stringify({
        feature_key: featureKey,
        enabled: behavior.enabled,
        tenant_id: behavior.tenantId ?? 1,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }) as unknown as typeof fetch;
}

function resetFeatureFlagState() {
  useFeatureFlagsStore.setState({
    tenantScope: undefined,
    flags: {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFeatureFlag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(flagBehaviors).forEach((key) => {
      delete flagBehaviors[key];
    });
    resetFeatureFlagState();
    installFeatureFlagFetchMock();
    useAuthStore.setState({
      role: 'TENANT_MANAGER',
      tenantId: '1',
    });
  });

  it('returns enabled=true when the API resolves the flag as enabled', async () => {
    setFlagSuccess('advanced_reports', true);

    const { result } = renderHook(() =>
      useFeatureFlag('advanced_reports')
    );

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.enabled).toBe(false);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.enabled).toBe(true);
  });

  it('returns enabled=false when the flag is disabled', async () => {
    setFlagSuccess('bulk_export', false);

    const { result } = renderHook(() =>
      useFeatureFlag('bulk_export')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.enabled).toBe(false);
  });

  it('returns enabled=false on API error (safe deny default)', async () => {
    setFlagReject('telemedicine', 'Network error');

    const { result } = renderHook(() =>
      useFeatureFlag('telemedicine')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.enabled).toBe(false);
  });

  it('transitions loading from true to false after resolution', async () => {
    const resolveFlag = setFlagDeferred('ai_insights');

    const { result } = renderHook(() =>
      useFeatureFlag('ai_insights')
    );

    expect(result.current.loading).toBe(true);

    act(() => {
      resolveFlag(true, 2);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(true);
  });
});

describe('FeatureGate component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(flagBehaviors).forEach((key) => {
      delete flagBehaviors[key];
    });
    resetFeatureFlagState();
    installFeatureFlagFetchMock();
    useAuthStore.setState({
      role: 'TENANT_MANAGER',
      tenantId: '1',
    });
  });

  it('renders children when the flag is enabled', async () => {
    setFlagSuccess('advanced_reports', true);

    render(
      <FeatureGate featureKey="advanced_reports">
        <span>Advanced Reports</span>
      </FeatureGate>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Advanced Reports')
      ).toBeInTheDocument();
    });
  });

  it('renders fallback when the flag is disabled', async () => {
    setFlagSuccess('bulk_export', false);

    render(
      <FeatureGate
        featureKey="bulk_export"
        fallback={<span>Upgrade to access bulk export</span>}
      >
        <span>Bulk Export</span>
      </FeatureGate>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Upgrade to access bulk export')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Bulk Export')).not.toBeInTheDocument();
  });

  it('renders fallback when the API errors (deny by default)', async () => {
    setFlagReject('telemedicine', '403 Forbidden');

    render(
      <FeatureGate
        featureKey="telemedicine"
        fallback={<span>Not available</span>}
      >
        <span>Telemedicine</span>
      </FeatureGate>
    );

    await waitFor(() => {
      expect(screen.getByText('Not available')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Telemedicine')
    ).not.toBeInTheDocument();
  });

  it('shows loading state while flag is being fetched', async () => {
    // Never resolves during this test.
    setFlagPending('ai_insights');

    render(
      <FeatureGate
        featureKey="ai_insights"
        loadingFallback={<div data-testid="loading">Loading…</div>}
      >
        <span>AI Insights</span>
      </FeatureGate>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.queryByText('AI Insights')).not.toBeInTheDocument();
  });
});

describe('TenantFeatureGuard component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(flagBehaviors).forEach((key) => {
      delete flagBehaviors[key];
    });
    resetFeatureFlagState();
    installFeatureFlagFetchMock();
  });

  it('gates TENANT_MANAGER users and shows fallback when feature is disabled', async () => {
    useAuthStore.setState({
      role: 'TENANT_MANAGER',
      tenantId: '1',
    });
    setFlagSuccess('custom_branding', false);

    render(
      <TenantFeatureGuard
        featureKey="custom_branding"
        fallback={<span>Custom branding unavailable</span>}
      >
        <span>Tenant branding controls</span>
      </TenantFeatureGuard>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Custom branding unavailable')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Tenant branding controls')
    ).not.toBeInTheDocument();
  });

  it('bypasses flag checks for non-tenant-manager roles', () => {
    useAuthStore.setState({
      role: 'DOCTOR',
      tenantId: '1',
    });

    render(
      <TenantFeatureGuard
        featureKey="custom_branding"
        fallback={<span>Hidden for plans</span>}
      >
        <span>Always visible to doctors</span>
      </TenantFeatureGuard>
    );

    expect(
      screen.getByText('Always visible to doctors')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Hidden for plans')
    ).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
