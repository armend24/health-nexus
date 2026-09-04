/**
 * Central auth store (Zustand): login, logout, session state, and route-guard helpers.
 *
 * - Tokens are persisted in the API client (localStorage keys: health-nexus.accessToken, health-nexus.refreshToken).
 *   This store mirrors the access token in state for convenience and holds user, role, loading, error.
 * - On app bootstrap, rehydration is done in __root (load token from storage → ensureAuth() → me() to hydrate user).
 * - ensureAuth(): if we have a token but no user, calls /auth/me to hydrate; on 403 falls back to decoding the JWT payload.
 * - On any API 401, the global handler clears token/user, sets authErrorReason, shows a toast, and guards redirect to /login.
 */
import {
  ApiError,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
  setUnauthorizedHandler,
} from '@/lib/api-client';
import type { Role } from '@/lib/rbacMatrix';
import {
  authService,
  type LoginCredentials,
} from '@/services/auth.service';
import { toast } from 'sonner';
import { create } from 'zustand';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated';

/** Set by expireSession() or revokeSession(); used by route guards to redirect with /login?reason=expired|revoked. */
export type AuthErrorReason = 'expired' | 'revoked' | null;

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | undefined;
  /** Access token (mirrors client; set on login/hydrate, cleared on logout). Backend returns it from /auth/login. */
  token: string | null;
  isAuthenticated: boolean;
  /** Last auth error message (e.g. login failure); cleared on successful login, logout, or ensureAuth. */
  error: string | null;
  role: Role | undefined;
  tenantId: string | undefined;
  authErrorReason: AuthErrorReason;
  clearAuth: () => void;
  expireSession: () => void;
  revokeSession: () => void;
  ensureAuth: () => Promise<boolean>;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  loadProfile: () => Promise<void>;
}

const ACTIVE_TENANT_KEY = 'health-nexus.activeTenantId';

function safeGetSelectedTenantId(): string | undefined {
  try {
    const value = globalThis.localStorage?.getItem(ACTIVE_TENANT_KEY);
    return value && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

function safeSetSelectedTenantId(value: string | undefined) {
  try {
    if (!globalThis.localStorage) return;
    if (value && value.trim()) {
      globalThis.localStorage.setItem(ACTIVE_TENANT_KEY, value);
      return;
    }
    globalThis.localStorage.removeItem(ACTIVE_TENANT_KEY);
  } catch {
    // ignore
  }
}

function resolveHydratedTenantId(
  role: Role | undefined,
  tenantIdRaw: unknown,
  fallbackTenantId?: string
): string | undefined {
  const normalizedFallbackTenantId =
    fallbackTenantId && fallbackTenantId.trim()
      ? fallbackTenantId.trim()
      : undefined;

  // CLIENT users can browse multiple storefront tenants, so preserve the
  // previously selected storefront context across refreshes when available.
  if (role === 'CLIENT' && normalizedFallbackTenantId) {
    return normalizedFallbackTenantId;
  }

  if (tenantIdRaw !== undefined && tenantIdRaw !== null) {
    const value = String(tenantIdRaw).trim();
    const parsed = Number(value);
    if (value && Number.isFinite(parsed) && parsed > 0) {
      return String(parsed);
    }
  }
  return normalizedFallbackTenantId;
}

function createInitialAuthState(): Pick<
  AuthState,
  | 'status'
  | 'user'
  | 'token'
  | 'isAuthenticated'
  | 'error'
  | 'role'
  | 'tenantId'
  | 'authErrorReason'
> {
  const accessToken = getAccessToken();
  return {
    status: accessToken ? 'loading' : 'unauthenticated',
    user: undefined,
    token: accessToken,
    isAuthenticated: false,
    error: null,
    role: undefined,
    tenantId: safeGetSelectedTenantId(),
    authErrorReason: null,
  };
}

const initialState = createInitialAuthState();

function clearedAuthState() {
  return {
    ...createInitialAuthState(),
    status: 'unauthenticated' as const,
    token: null,
    tenantId: undefined,
  };
}

/** Map backend /auth/me or JWT role string (e.g. "admin", "doctor") to frontend Role for rbacMatrix. */
function mapBackendRole(role: unknown): Role | undefined {
  if (typeof role !== 'string') return undefined;
  const normalized = role.trim();
  if (!normalized) return undefined;

  const lower = normalized.toLowerCase();
  const upper = normalized.toUpperCase();

  if (
    upper === 'SUPER_ADMIN' ||
    lower === 'super_admin' ||
    lower === 'admin'
  )
    return 'SUPER_ADMIN';
  if (
    upper === 'TENANT_MANAGER' ||
    lower === 'tenant_manager' ||
    lower === 'tenant-manager'
  )
    return 'TENANT_MANAGER';
  if (upper === 'DOCTOR' || lower === 'doctor') return 'DOCTOR';
  if (
    upper === 'SALES' ||
    lower === 'sales' ||
    upper === 'SALES_AGENT' ||
    lower === 'sales_agent'
  )
    return 'SALES';
  if (
    upper === 'CLIENT' ||
    lower === 'client' ||
    upper === 'PATIENT' ||
    lower === 'patient'
  )
    return 'CLIENT';

  return undefined;
}

/** Single in-flight promise for ensureAuth so concurrent guards share one /auth/me call. */
let ensureAuthPromise: Promise<boolean> | null = null;

/** Decode base64url (JWT payload segment). Works in browser (atob) and Node (Buffer). */
function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLength);

  if (typeof globalThis.atob === 'function')
    return globalThis.atob(padded);
  // eslint-disable-next-line no-undef
  return Buffer.from(padded, 'base64').toString('binary');
}

/** Decode JWT payload without verifying (used only when /auth/me returns 403 but token is present). */
function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = base64UrlDecode(parts[1]!);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...initialState,
  /** Clears token (and persistence), user, and all auth state. No redirect; call from logout or reset. */
  clearAuth: () => {
    clearTokens();
    ensureAuthPromise = null;
    set(clearedAuthState());
  },
  /** Call when access token is invalid/expired (e.g. after 401). Clears token/user, sets authErrorReason; guard redirects to /login?reason=expired. */
  expireSession: () => {
    clearTokens();
    ensureAuthPromise = null;
    set({
      ...clearedAuthState(),
      authErrorReason: 'expired',
    });
  },
  /** Call when session was explicitly revoked (e.g. after refresh returns 401). Redirects get /login?reason=revoked. */
  revokeSession: () => {
    clearTokens();
    ensureAuthPromise = null;
    set({
      ...clearedAuthState(),
      authErrorReason: 'revoked',
    });
  },
  /**
   * Resolve to true if the user is authenticated (either already in store or after loading from /auth/me).
   * Reads token from storage; if present, calls /auth/me to hydrate user/role (or decodes JWT on 403).
   * Used on bootstrap and by dashboard beforeLoad.
   */
  ensureAuth: async () => {
    const { isAuthenticated, status } = get();
    if (isAuthenticated) return true;

    const token = getAccessToken();
    if (!token) {
      if (status !== 'unauthenticated') set(clearedAuthState());
      return false;
    }

    if (ensureAuthPromise) return ensureAuthPromise;

    ensureAuthPromise = (async () => {
      set({ status: 'loading', error: null });
      try {
        const res = await authService.me();
        const role = mapBackendRole(res.user?.role);
        const tenantIdRaw = res.user?.tenant_id;
        const fallbackTenantId = get().tenantId;
        set({
          status: 'authenticated',
          user: {
            id: String(res.user.user_id),
            email: String(res.user.email),
          },
          token,
          role,
          tenantId: resolveHydratedTenantId(
            role,
            tenantIdRaw,
            fallbackTenantId
          ),
          isAuthenticated: true,
          error: null,
          authErrorReason: null,
        });
        return true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[ensureAuth] Error:',
          err instanceof ApiError
            ? `${err.status} - ${err.message}`
            : err
        );

        /** Backend may return 403 for /auth/me for some roles; token is still valid so we derive user/role from JWT. */
        if (err instanceof ApiError && err.status === 403) {
          const payload = decodeJwtPayload(token);
          if (payload && typeof payload.email === 'string') {
            const role = mapBackendRole(payload.role);
            const tenantIdRaw = payload.tenant_id;
            const fallbackTenantId = get().tenantId;
            set({
              status: 'authenticated',
              user: {
                id:
                  payload.user_id !== undefined
                    ? String(payload.user_id)
                    : 'unknown',
                email: payload.email,
              },
              token,
              role,
              tenantId: resolveHydratedTenantId(
                role,
                tenantIdRaw,
                fallbackTenantId
              ),
              isAuthenticated: true,
              error: null,
              authErrorReason: null,
            });
            return true;
          }
        }

        /** On 401, the client's onUnauthorized already ran (expireSession + toast); don't overwrite state again. */
        if (!(err instanceof ApiError && err.status === 401)) {
          set({
            ...clearedAuthState(),
            error:
              err instanceof Error
                ? err.message
                : 'Failed to load session',
          });
        }
        return false;
      } finally {
        ensureAuthPromise = null;
      }
    })();

    return ensureAuthPromise;
  },
  /** POST /auth/login, persist tokens, then ensureAuth(). Sets error and rethrows if profile cannot be loaded. */
  login: async (credentials) => {
    set({
      status: 'loading',
      error: null,
      authErrorReason: null,
    });
    try {
      const tokenRes = await authService.login(credentials);
      setTokens({
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token,
      });
      await get().ensureAuth();
      if (!get().isAuthenticated) {
        clearTokens();
        set({
          ...clearedAuthState(),
          error: 'Failed to load profile',
        });
        throw new Error('Failed to load profile');
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.displayMessage
          : err instanceof Error
            ? err.message
            : 'Sign in failed';
      set({ ...clearedAuthState(), error: message });
      throw err;
    }
  },
  /** POST /auth/logout (best-effort), then clear token/user and reset state. */
  logout: async () => {
    const rt = getRefreshToken();
    try {
      if (rt) await authService.logout(rt);
    } catch {
      // ignore backend logout failures (we still clear local session)
    } finally {
      get().clearAuth();
    }
  },
  /** Try to get a new access token; on 401 revoke session and return false. Used by other API layers for retries. */
  refresh: async () => {
    const rt = getRefreshToken();
    if (!rt) return false;

    try {
      const res = await authService.refresh(rt);
      setTokens({
        accessToken: res.access_token,
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        ensureAuthPromise = null;
        get().revokeSession();
        return false;
      }
      return false;
    }
  },
  loadProfile: async () => {
    await get().ensureAuth();
  },
}));

useAuthStore.subscribe((state) => {
  safeSetSelectedTenantId(state.tenantId);
});

/** On any API 401: clear token/user, set authErrorReason (so guards redirect to /login?reason=expired), and show toast. */
setUnauthorizedHandler(() => {
  const hasToken = Boolean(getAccessToken());
  const { isAuthenticated } = useAuthStore.getState();
  if (!hasToken && !isAuthenticated) return;
  clearTokens();
  ensureAuthPromise = null;
  useAuthStore.getState().expireSession();
  toast.error('Session expired. Please sign in again.');
});
