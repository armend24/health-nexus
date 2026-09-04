import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  apiFetch: async (
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    } = {}
  ) => {
    const response = await fetch(`http://localhost:8000${path}`, {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });

    return response.json();
  },
}));

import { checkoutService } from '@/services/checkout.service';

describe('checkout.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('posts checkout initiation requests with the idempotency key header', async () => {
    const response = {
      payment_id: 91,
      status: 'pending',
      stripe_payment_intent_id: 'pi_123',
      stripe_client_secret: 'cs_123',
      amount: 4999,
      tenant_id: 12,
    };
    (global.fetch as unknown as jest.Mock).mockImplementation(
      async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
    );

    await expect(
      checkoutService.initiate(
        {
          enrollment_id: 44,
          order_id: 77,
        },
        'idem-key-123'
      )
    ).resolves.toEqual(response);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/checkout/initiate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-key-123',
        }),
        body: JSON.stringify({
          enrollment_id: 44,
          order_id: 77,
        }),
      })
    );
  });
});
