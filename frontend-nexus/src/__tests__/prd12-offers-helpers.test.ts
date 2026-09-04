import {
  getNotificationNavigationTarget,
  getOfferStatusVariant,
} from '@/lib/offers';

describe('PRD-12 offer helpers', () => {
  it('maps offer statuses to badge variants', () => {
    expect(getOfferStatusVariant('ACCEPTED')).toBe('success');
    expect(getOfferStatusVariant('DECLINED')).toBe('destructive');
    expect(getOfferStatusVariant('EXPIRED')).toBe('expired');
    expect(getOfferStatusVariant('VIEWED')).toBe('warning');
    expect(getOfferStatusVariant('DELIVERED')).toBe('default');
  });

  it('routes offer notifications to the client offers section', () => {
    expect(
      getNotificationNavigationTarget({
        type: 'OFFER_DELIVERED',
        entity_type: 'offer_delivery',
        entity_id: 9,
      })
    ).toEqual({
      to: '/dashboard/client/$section',
      params: { section: 'offers' },
    });
  });

  it('routes appointment notifications to the appointment detail page', () => {
    expect(
      getNotificationNavigationTarget({
        type: 'APPOINTMENT_COMPLETED',
        entity_type: 'appointment',
        entity_id: 15,
      })
    ).toEqual({
      to: '/appointments/$appointmentId',
      params: { appointmentId: '15' },
    });
  });
});
