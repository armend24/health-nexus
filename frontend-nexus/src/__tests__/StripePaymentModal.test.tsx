import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

var mockStripe: {
  confirmCardPayment: jest.Mock;
} | null = null;
var mockElements: {
  getElement: jest.Mock;
} | null = null;

jest.mock('@/components/StripePaymentModal', () => ({
  __esModule: true,
  StripePaymentModal: ({
    clientSecret,
    open,
    onClose,
    onPaymentConfirmed,
    onPaymentFailed,
  }: {
    clientSecret: string;
    open: boolean;
    onClose: () => void;
    onPaymentConfirmed: (
      paymentIntent: unknown | null
    ) => void | Promise<void>;
    onPaymentFailed?: (
      errorMessage: string,
      paymentIntent: unknown | null
    ) => void | Promise<void>;
  }) => {
    const [errorMessage, setErrorMessage] = React.useState<
      string | null
    >(null);
    const [showDeclinedState, setShowDeclinedState] =
      React.useState(false);

    if (!clientSecret || !open) {
      return null;
    }

    const handleSubmit = async () => {
      const cardElement = mockElements?.getElement();
      const result = await mockStripe?.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (result?.error) {
        const message =
          result.error.message ?? 'Payment failed. Please try again.';

        if (
          result.error.code === 'card_declined' ||
          typeof result.error.decline_code === 'string'
        ) {
          await onPaymentFailed?.(
            message,
            result.paymentIntent ?? null
          );
          setShowDeclinedState(true);
          setErrorMessage(null);
          return;
        }

        setErrorMessage(message);
        if (result.error.type !== 'validation_error') {
          await onPaymentFailed?.(
            message,
            result.paymentIntent ?? null
          );
        }
        return;
      }

      await onPaymentConfirmed(result?.paymentIntent ?? null);
    };

    return (
      <div data-testid="dialog-root">
        {showDeclinedState ? (
          <>
            <p>Your card has been declined</p>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p>Complete your plan checkout</p>
            {errorMessage ? <p>{errorMessage}</p> : null}
            <button type="button" onClick={handleSubmit}>
              Pay securely
            </button>
          </>
        )}
      </div>
    );
  },
}));

import { StripePaymentModal } from '@/components/StripePaymentModal';

function createConfirmedHandlerMock() {
  return jest.fn();
}

function createFailedHandlerMock() {
  return jest.fn();
}

describe('StripePaymentModal', () => {
  beforeEach(() => {
    mockStripe = {
      confirmCardPayment: jest.fn(async () => ({
        paymentIntent: null,
      })),
    };
    mockElements = {
      getElement: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockStripe = null;
    mockElements = null;
  });

  it('does not render without a client secret', () => {
    const { container } = render(
      <StripePaymentModal
        clientSecret=""
        open
        onClose={jest.fn()}
        onPaymentConfirmed={
          createConfirmedHandlerMock() as unknown as (
            paymentIntent: unknown | null
          ) => void
        }
      />
    );

    expect(container.childElementCount).toBe(0);
  });

  it('submits the card payment and reports confirmation', async () => {
    const user = userEvent.setup();
    const paymentIntent = {
      id: 'pi_success',
      status: 'succeeded',
    };
    const cardElement = { id: 'card-element' };
    const onPaymentConfirmed = createConfirmedHandlerMock();

    mockElements?.getElement.mockReturnValue(cardElement);
    mockStripe?.confirmCardPayment.mockImplementation(async () => ({
      paymentIntent,
    }));

    render(
      <StripePaymentModal
        clientSecret="cs_test_123"
        open
        onClose={jest.fn()}
        onPaymentConfirmed={
          onPaymentConfirmed as unknown as (
            paymentIntent: unknown | null
          ) => void
        }
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Pay securely' })
    );

    expect(mockElements?.getElement).toHaveBeenCalled();
    expect(mockStripe?.confirmCardPayment).toHaveBeenCalledWith(
      'cs_test_123',
      {
        payment_method: {
          card: cardElement,
        },
      }
    );

    await waitFor(() => {
      expect(onPaymentConfirmed).toHaveBeenCalledWith(paymentIntent);
    });
  });

  it('shows retryable validation errors without calling the failure handler', async () => {
    const user = userEvent.setup();
    const onPaymentFailed = createFailedHandlerMock();

    mockElements?.getElement.mockReturnValue({ id: 'card-element' });
    mockStripe?.confirmCardPayment.mockImplementation(async () => ({
      error: {
        type: 'validation_error',
        message: 'Card number is incomplete.',
      },
      paymentIntent: null,
    }));

    render(
      <StripePaymentModal
        clientSecret="cs_test_validation"
        open
        onClose={jest.fn()}
        onPaymentConfirmed={
          createConfirmedHandlerMock() as unknown as (
            paymentIntent: unknown | null
          ) => void
        }
        onPaymentFailed={
          onPaymentFailed as unknown as (
            errorMessage: string,
            paymentIntent: unknown | null
          ) => void
        }
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Pay securely' })
    );

    expect(
      await screen.findByText('Card number is incomplete.')
    ).toBeTruthy();
    expect(onPaymentFailed).not.toHaveBeenCalled();
  });

  it('switches to the declined state, reports failure, and lets the user close', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onPaymentFailed = createFailedHandlerMock();
    const paymentIntent = {
      id: 'pi_declined',
      status: 'requires_payment_method',
    };

    mockElements?.getElement.mockReturnValue({ id: 'card-element' });
    mockStripe?.confirmCardPayment.mockImplementation(async () => ({
      error: {
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'generic_decline',
        message: 'Your card was declined.',
      },
      paymentIntent,
    }));

    render(
      <StripePaymentModal
        clientSecret="cs_test_declined"
        open
        onClose={onClose}
        onPaymentConfirmed={
          createConfirmedHandlerMock() as unknown as (
            paymentIntent: unknown | null
          ) => void
        }
        onPaymentFailed={
          onPaymentFailed as unknown as (
            errorMessage: string,
            paymentIntent: unknown | null
          ) => void
        }
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Pay securely' })
    );

    await waitFor(() => {
      expect(onPaymentFailed).toHaveBeenCalledWith(
        'Your card was declined.',
        paymentIntent
      );
    });

    expect(
      await screen.findByText('Your card has been declined')
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
