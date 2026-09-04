import type { Contract, ContractStatus } from '@/interfaces/contract';
import {
  API_BASE_URL,
  ApiError,
  apiFetch,
  getAccessToken,
  type ValidationError,
} from '@/lib/api-client';

// Transition matrix mirrors backend domain rules.
const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> =
  {
    DRAFT: ['ACTIVE', 'TERMINATED'],
    ACTIVE: ['EXPIRED', 'TERMINATED'],
    EXPIRED: [],
    TERMINATED: [],
  };

/** Build a full API URL for direct fetch usage (multipart uploads). */
function toApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://'))
    return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;
}

/**
 * Parse FastAPI-style error payloads for non-JSON and JSON responses alike.
 * We keep this local to ensure multipart requests return the same error style as apiFetch.
 */
async function parseUploadError(response: Response): Promise<{
  detail?: string | ValidationError[];
  data?: unknown;
}> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const data = (await response.json()) as unknown;
      const detail =
        typeof data === 'object' && data !== null && 'detail' in data
          ? (
              data as {
                detail?: string | ValidationError[];
              }
            ).detail
          : undefined;
      return { detail, data };
    } catch {
      return {
        detail: undefined,
        data: undefined,
      };
    }
  }

  try {
    const text = await response.text();
    return {
      detail: text || undefined,
      data: text || undefined,
    };
  } catch {
    return { detail: undefined, data: undefined };
  }
}

/**
 * Multipart uploads cannot use apiFetch directly because apiFetch always sets JSON Content-Type.
 * For FormData, the browser must set the multipart boundary automatically.
 */
async function uploadSignature(
  path: string,
  file: File
): Promise<Contract> {
  const formData = new FormData();
  formData.append('signature', file);

  // Reuse existing auth token from api-client so we rely on the same login/session flow.
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(toApiUrl(path), {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const { detail, data } = await parseUploadError(response);
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      detail,
      data
    );
  }

  return (await response.json()) as Contract;
}

export const contractsService = {
  /**
   * Backend already returns snake_case fields; we keep them unchanged in the frontend contract type.
   */
  async getContract(contractId: number | string): Promise<Contract> {
    return apiFetch<Contract>(`/api/contracts/${contractId}`, {
      method: 'GET',
    });
  },

  async getContracts(
    tenantId: number,
    doctorUserId?: number
  ): Promise<Contract[]> {
    const query =
      typeof doctorUserId === 'number'
        ? `?doctor_user_id=${encodeURIComponent(String(doctorUserId))}`
        : '';

    return apiFetch<Contract[]>(
      `/api/tenants/${tenantId}/contracts${query}`,
      {
        method: 'GET',
      }
    );
  },

  async createContract(
    tenantId: number,
    input: {
      doctor_user_id: number;
      salary: string;
      terms_content: string;
      start_date: string;
      end_date: string;
    }
  ): Promise<Contract> {
    return apiFetch<Contract>(`/api/tenants/${tenantId}/contracts`, {
      method: 'POST',
      body: input,
    });
  },

  async updateContract(
    contractId: number | string,
    patch: Partial<
      Pick<
        Contract,
        'salary' | 'terms_content' | 'start_date' | 'end_date'
      >
    >
  ): Promise<Contract> {
    return apiFetch<Contract>(`/api/contracts/${contractId}`, {
      method: 'PATCH',
      body: patch,
    });
  },

  async transitionContract(
    contractId: number | string,
    nextStatus: ContractStatus,
    reason?: string
  ): Promise<Contract> {
    // Guard unknown client-side status values early; backend remains source of truth.
    if (!(nextStatus in ALLOWED_TRANSITIONS)) {
      throw new Error(
        `Unsupported status transition target: ${nextStatus}`
      );
    }

    if (nextStatus === 'TERMINATED' && !reason?.trim()) {
      throw new Error('Termination reason is required.');
    }

    return apiFetch<Contract>(
      `/api/contracts/${contractId}/transition`,
      {
        method: 'POST',
        body: {
          // Backend transition endpoint expects snake_case body keys.
          next_status: nextStatus,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
      }
    );
  },

  async signDoctor(
    contractId: number | string,
    file: File
  ): Promise<Contract> {
    return uploadSignature(
      `/api/contracts/${contractId}/sign/doctor`,
      file
    );
  },

  async signHospital(
    contractId: number | string,
    file: File
  ): Promise<Contract> {
    return uploadSignature(
      `/api/contracts/${contractId}/sign/hospital`,
      file
    );
  },
};
