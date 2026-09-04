import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  clearCheckoutRecovery,
  loadCheckoutRecovery,
  saveCheckoutRecovery,
} from '@/services/checkout-recovery.service';

const ENROLLMENT_STORAGE_KEY =
  'health-nexus.checkout-recovery.enrollment';

describe('checkout-recovery.service', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('saves a recovery record and loads it back with a refreshed updatedAt value', () => {
    const now = new Date('2026-03-10T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const saved = saveCheckoutRecovery({
      kind: 'enrollment',
      tenantId: 14,
      planId: 22,
      paymentId: 31,
      referenceId: 41,
      phase: 'collecting_payment',
      startedAt: '2026-03-10T09:55:00.000Z',
      updatedAt: '2026-03-10T09:56:00.000Z',
      clientSecret: 'cs_saved',
    });

    expect(saved.updatedAt).toBe(now.toISOString());

    expect(loadCheckoutRecovery('enrollment')).toEqual(saved);
  });

  it('drops malformed records from storage', () => {
    window.localStorage.setItem(
      ENROLLMENT_STORAGE_KEY,
      JSON.stringify({
        kind: 'enrollment',
        tenantId: 'bad-id',
      })
    );

    expect(loadCheckoutRecovery('enrollment')).toBeNull();
    expect(
      window.localStorage.getItem(ENROLLMENT_STORAGE_KEY)
    ).toBeNull();
  });

  it('expires stale records based on startedAt', () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(
        new Date('2026-03-12T12:00:00.000Z').getTime()
      );

    window.localStorage.setItem(
      ENROLLMENT_STORAGE_KEY,
      JSON.stringify({
        kind: 'enrollment',
        tenantId: 14,
        planId: 22,
        paymentId: 31,
        referenceId: 41,
        phase: 'processing',
        startedAt: '2026-03-10T09:55:00.000Z',
        updatedAt: '2026-03-10T09:56:00.000Z',
      })
    );

    expect(loadCheckoutRecovery('enrollment')).toBeNull();
    expect(
      window.localStorage.getItem(ENROLLMENT_STORAGE_KEY)
    ).toBeNull();
  });

  it('clears stored recovery state for a kind', () => {
    window.localStorage.setItem(
      ENROLLMENT_STORAGE_KEY,
      JSON.stringify({ kind: 'enrollment' })
    );

    clearCheckoutRecovery('enrollment');

    expect(
      window.localStorage.getItem(ENROLLMENT_STORAGE_KEY)
    ).toBeNull();
  });
});
