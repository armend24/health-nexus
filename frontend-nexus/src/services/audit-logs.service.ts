import type { AuditLogListResponse } from '@/interfaces/audit-log';
import { api } from '@/lib/api-client';

export const auditLogsService = {
  list: async (page = 1, pageSize = 10) => {
    const query = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });

    return api.get<AuditLogListResponse>(
      `/audit-logs?${query.toString()}`
    );
  },
};
