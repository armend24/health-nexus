import { clearTokens, setTokens } from '@/lib/api-client';
import { offersService } from '@/services/offers.service';
import { jest } from '@jest/globals';

describe('PRD-12 offers service', () => {
  beforeEach(() => {
    setTokens({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
    });
  });

  afterEach(() => {
    clearTokens();
    jest.restoreAllMocks();
  });

  it('fetches client offers', async () => {
    globalThis.fetch = jest.fn(async (input) => {
      const url =
        typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/clients/7/offers');
      return new Response(
        JSON.stringify([
          {
            id: 1,
            recommendation_id: 11,
            client_id: 7,
            offer_status: 'DELIVERED',
            delivery_channel: 'IN_APP',
            sent_at: '2026-03-10T10:00:00Z',
            expires_at: '2026-03-24T10:00:00Z',
            created_at: '2026-03-10T10:00:00Z',
            updated_at: '2026-03-10T10:00:00Z',
            recommendation: {
              id: 11,
              appointment_id: 22,
              doctor_id: 3,
              client_id: 7,
              category: 'CARE_PLAN',
              recommendation_type: 'Recovery plan',
              approved: true,
              created_at: '2026-03-10T10:00:00Z',
            },
            acceptance: null,
          },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });

    const result = await offersService.getClientOffers(7);

    expect(result).toHaveLength(1);
    expect(result[0]?.recommendation.recommendation_type).toBe(
      'Recovery plan'
    );
  });

  it('accepts an offer', async () => {
    globalThis.fetch = jest.fn(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/offers/15/accept');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-token',
      });
      return new Response(
        JSON.stringify({
          id: 15,
          recommendation_id: 11,
          client_id: 7,
          offer_status: 'ACCEPTED',
          delivery_channel: 'IN_APP',
          sent_at: '2026-03-10T10:00:00Z',
          expires_at: '2026-03-24T10:00:00Z',
          created_at: '2026-03-10T10:00:00Z',
          updated_at: '2026-03-10T10:10:00Z',
          recommendation: {
            id: 11,
            appointment_id: 22,
            doctor_id: 3,
            client_id: 7,
            category: 'CARE_PLAN',
            recommendation_type: 'Recovery plan',
            approved: true,
            created_at: '2026-03-10T10:00:00Z',
          },
          acceptance: {
            id: 1,
            offer_delivery_id: 15,
            accepted_at: '2026-03-10T10:10:00Z',
            redemption_method: 'IN_APP',
            transaction_id: 'offer-15',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });

    const result = await offersService.acceptOffer(15, {
      redemption_method: 'IN_APP',
      transaction_id: 'offer-15',
    });

    expect(result.offer_status).toBe('ACCEPTED');
    expect(result.acceptance?.transaction_id).toBe('offer-15');
  });
});
