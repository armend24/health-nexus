/**
 * Unified API client for Health Nexus backend.
 *
 * - Base URL: VITE_API_BASE_URL, defaults to localhost:8000.
 * - Adds Authorization: Bearer <token> when a token is in storage.
 * - Error handling: FastAPI format (detail), displayMessage, isValidation.
 * - On 401, invokes setUnauthorizedHandler (auth store session expiry).
 */
export const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000';

/** Validation error from FastAPI (422 Unprocessable Entity) */
export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

interface ApiErrorPayload {
  detail?: string | ValidationError[];
}

/** Structured error thrown by the API client */
export class ApiError extends Error {
  readonly detail: string | ValidationError[] | undefined;

  constructor(
    message: string,
    public readonly status: number,
    detail?: string | ValidationError[],
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.detail = detail;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** Human-readable message for display (FastAPI detail or validation errors) */
  get displayMessage(): string {
    if (typeof this.detail === 'string') return this.detail;
    if (Array.isArray(this.detail) && this.detail.length > 0) {
      return this.detail.map((e) => e.msg).join('; ');
    }
    return this.message;
  }

  /** Whether this is a validation error (422) */
  get isValidation(): boolean {
    return this.status === 422 && Array.isArray(this.detail);
  }
}

/** Type guard for ApiError */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

// Token storage (used by auth store and for Bearer injection)
const ACCESS_TOKEN_KEY = 'health-nexus.accessToken';
const REFRESH_TOKEN_KEY = 'health-nexus.refreshToken';

function safeGetStorageItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetStorageItem(key: string, value: string | null) {
  try {
    if (!globalThis.localStorage) return;
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

let accessToken: string | null = safeGetStorageItem(ACCESS_TOKEN_KEY);
let refreshToken: string | null =
  safeGetStorageItem(REFRESH_TOKEN_KEY);

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setTokens(tokens: {
  accessToken: string | null;
  refreshToken?: string | null;
}) {
  accessToken = tokens.accessToken;
  safeSetStorageItem(ACCESS_TOKEN_KEY, accessToken);
  if ('refreshToken' in tokens) {
    refreshToken = tokens.refreshToken ?? null;
    safeSetStorageItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearTokens() {
  setTokens({
    accessToken: null,
    refreshToken: null,
  });
}

type UnauthorizedHandler = (err: ApiError) => void;
let onUnauthorized: UnauthorizedHandler | undefined;

export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | undefined
) {
  onUnauthorized = handler;
}

function joinUrl(base: string, path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  return base.replace(/\/+$/, '') + path;
}

async function parseJsonSafely(
  res: Response
): Promise<unknown | undefined> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('application/json'))
    return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function readTextSafely(
  res: Response
): Promise<string | undefined> {
  try {
    const t = await res.text();
    return t.trim() ? t : undefined;
  } catch {
    return undefined;
  }
}

/** Paths where a 401 means "wrong credentials", not "session expired" — don't fire the global session handler. */
const AUTH_OWN_401_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/refresh',
];

function buildError(
  res: Response,
  data: unknown,
  text: string | undefined,
  url: string
): ApiError {
  let message = 'Request failed';
  let detail: string | ValidationError[] | undefined;
  if (data && typeof data === 'object' && 'detail' in data) {
    const d = (data as ApiErrorPayload).detail;
    if (typeof d === 'string') {
      message = d;
      detail = d;
    } else if (Array.isArray(d) && d.length > 0) {
      detail = d;
      message = d.map((e) => e.msg).join('; ');
    }
  }
  if (!message || message === 'Request failed') {
    message = text ?? res.statusText ?? 'Request failed';
  }
  const err = new ApiError(
    `Request failed: ${res.status} ${res.statusText}`,
    res.status,
    detail,
    data ?? text
  );
  const isAuthOwnPath = AUTH_OWN_401_PATHS.some((p) =>
    url.includes(p)
  );
  if (res.status === 401 && !isAuthOwnPath) onUnauthorized?.(err);
  return err;
}

/** Options for apiFetch */
export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipJson?: boolean;
}

/**
 * Fetch wrapper with base URL, Bearer token, error parsing, JSON handling.
 * Use for all backend API calls (auth, roles, tenants, audit-logs).
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const {
    body,
    skipJson = false,
    headers: customHeaders,
    ...fetchOpts
  } = options;

  const url = path.startsWith('http')
    ? path
    : joinUrl(API_BASE_URL, path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    ...fetchOpts,
    headers,
    ...(body !== undefined && {
      body: JSON.stringify(body),
    }),
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'Network request failed',
      0,
      'Unable to reach the server. Check your connection.'
    );
  }

  const data = await parseJsonSafely(res);
  const text =
    data === undefined ? await readTextSafely(res) : undefined;

  if (!res.ok) {
    throw buildError(res, data, text, url);
  }

  if (skipJson || res.status === 204) return undefined as T;

  const ct = res.headers.get('content-type');
  if (!ct?.includes('application/json'))
    return (await res.text()) as unknown as T;

  return data as T;
}

/** Init for request() - body can be object (will be JSON stringified) or string */
export interface RequestInitWithBody extends Omit<
  RequestInit,
  'body'
> {
  body?: unknown;
}

/**
 * Fetch with Bearer token. Thin wrapper over apiFetch.
 * Accepts body as object (preferred) or pre-stringified JSON.
 */
export async function request<TResponse = unknown>(
  path: string,
  init: RequestInitWithBody = {}
): Promise<TResponse> {
  const body = init.body;
  const parsedBody =
    body === undefined
      ? undefined
      : typeof body === 'string'
        ? (JSON.parse(body) as unknown)
        : body;
  return apiFetch<TResponse>(path, {
    method: init.method ?? 'GET',
    headers: init.headers,
    body: parsedBody,
  });
}

/** Convenience methods for common verbs */
export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, {
      ...init,
      method: 'POST',
      body,
    }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, {
      ...init,
      method: 'PUT',
      body,
    }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, {
      ...init,
      method: 'PATCH',
      body,
    }),
  delete: <T>(path: string, init?: RequestInit) =>
    apiFetch<T>(path, {
      ...init,
      method: 'DELETE',
      skipJson: true,
    }),
};
