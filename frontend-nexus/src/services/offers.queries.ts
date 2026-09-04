import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { invalidateNotifications } from './notifications.queries';
import {
  offersService,
  type AcceptOfferRequest,
  type GenerateOffersRequest,
  type GenerateOffersResponse,
  type OfferDelivery,
  type OfferViewResponse,
} from './offers.service';

// Query key prefix for offer-related queries
const OFFERS_KEY = ['offers'] as const;

/**
 * Returns the query key for a client's offers.
 * @param clientId Client user id
 */
export function getOffersKey(clientId: number | string) {
  return [...OFFERS_KEY, Number(clientId)] as const;
}

/**
 * Fetches the list of offers for a client.
 * @param clientId Client user id
 */
export function useClientOffers(
  clientId: number | string | undefined
) {
  return useQuery({
    queryKey: clientId
      ? getOffersKey(clientId)
      : [...OFFERS_KEY, 'missing'],
    queryFn: () => offersService.getClientOffers(Number(clientId)),
    enabled: Boolean(clientId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Mutation hook to generate offers for an appointment.
 * Invalidates client offers and notifications on success.
 */
export function useGenerateOffers() {
  const qc = useQueryClient();
  return useMutation<
    GenerateOffersResponse,
    Error,
    GenerateOffersRequest
  >({
    mutationFn: (payload: GenerateOffersRequest) =>
      offersService.generateOffers(payload),
    onSuccess: (result) => {
      const clientId = result.offers[0]?.client_id;
      if (clientId != null) {
        qc.invalidateQueries({
          queryKey: getOffersKey(clientId),
        });
      }
      invalidateNotifications(qc);
      toast.success('Offers generated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate offers');
    },
  });
}

/**
 * Mutation hook to mark an offer as viewed.
 * Invalidates client offers and notifications on success.
 */
export function useViewOffer(clientId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation<OfferViewResponse, Error, number>({
    mutationFn: (offerId: number) => offersService.viewOffer(offerId),
    onSuccess: () => {
      if (clientId) {
        qc.invalidateQueries({
          queryKey: getOffersKey(clientId),
        });
      }
      invalidateNotifications(qc);
    },
  });
}

/**
 * Mutation hook to accept an offer.
 * Invalidates client offers and notifications on success.
 */
export function useAcceptOffer(
  clientId: number | string | undefined
) {
  const qc = useQueryClient();
  return useMutation<
    OfferDelivery,
    Error,
    {
      offerId: number;
      payload: AcceptOfferRequest;
    }
  >({
    mutationFn: ({
      offerId,
      payload,
    }: {
      offerId: number;
      payload: AcceptOfferRequest;
    }) => offersService.acceptOffer(offerId, payload),
    onSuccess: () => {
      if (clientId) {
        qc.invalidateQueries({
          queryKey: getOffersKey(clientId),
        });
      }
      invalidateNotifications(qc);
      toast.success('Offer accepted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to accept offer');
    },
  });
}

/**
 * Mutation hook to decline an offer.
 * Invalidates client offers and notifications on success.
 */
export function useDeclineOffer(
  clientId: number | string | undefined
) {
  const qc = useQueryClient();
  return useMutation<OfferViewResponse, Error, number>({
    mutationFn: (offerId: number) =>
      offersService.declineOffer(offerId),
    onSuccess: () => {
      if (clientId) {
        qc.invalidateQueries({
          queryKey: getOffersKey(clientId),
        });
      }
      invalidateNotifications(qc);
      toast.success('Offer declined');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to decline offer');
    },
  });
}
