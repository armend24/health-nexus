import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PaymentFlowNotice } from '@/components/PaymentFlowNotice';

describe('PaymentFlowNotice', () => {
  it('renders the supplied content with the phase badge', () => {
    render(
      <PaymentFlowNotice
        phase="processing"
        eyebrow="Enrollment"
        title="Payment is processing"
        description="We are waiting for the final Stripe confirmation."
      />
    );

    expect(screen.getByText('Enrollment')).toBeTruthy();
    expect(screen.getByText('Payment is processing')).toBeTruthy();
    expect(
      screen.getByText(
        'We are waiting for the final Stripe confirmation.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Awaiting confirmation')).toBeTruthy();
  });

  it('uses the default eyebrow and wires both actions', async () => {
    const user = userEvent.setup();
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();

    render(
      <PaymentFlowNotice
        phase="attention_required"
        title="Payment needs attention"
        description="Retry the checkout or close the flow."
        primaryAction={{
          label: 'Retry payment',
          onClick: onPrimary,
        }}
        secondaryAction={{
          label: 'Dismiss',
          onClick: onSecondary,
          variant: 'ghost',
        }}
      />
    );

    expect(screen.getByText('Payment status')).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await user.click(
      screen.getByRole('button', { name: 'Retry payment' })
    );

    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('passes loading state through to actions', () => {
    render(
      <PaymentFlowNotice
        phase="collecting_payment"
        title="Checkout ready"
        description="You can continue the payment flow now."
        primaryAction={{
          label: 'Continue',
          onClick: jest.fn(),
          loading: true,
        }}
      />
    );

    expect(
      screen
        .getByRole('button', { name: 'Continue' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(screen.getAllByText('Checkout ready')).toHaveLength(2);
  });
});
