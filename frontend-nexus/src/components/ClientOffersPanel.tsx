import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getOfferStatusVariant } from '@/lib/offers';
import {
  useAcceptOffer,
  useClientOffers,
  useDeclineOffer,
  useViewOffer,
} from '@/services/offers.queries';
import { useFeatureFlag } from '@/stores/use-feature-flag';

interface ClientOffersPanelProps {
  clientId: number | string | undefined;
}

function formatDate(value: string | null) {
  if (!value) return 'Not set';

  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ClientOffersPanel({
  clientId,
}: ClientOffersPanelProps) {
  const { enabled, loading: flagLoading } = useFeatureFlag(
    'post_appointment_offers'
  );
  const offersQuery = useClientOffers(clientId);
  const { mutate: markOfferViewed } = useViewOffer(clientId);
  const acceptOffer = useAcceptOffer(clientId);
  const declineOffer = useDeclineOffer(clientId);
  const viewedOfferIds = useRef<Set<number>>(new Set());
  const [selectedOfferId, setSelectedOfferId] = useState<
    number | null
  >(null);

  const offers = offersQuery.data ?? [];
  const selectedOffer =
    offers.find((offer) => offer.id === selectedOfferId) ?? offers[0];

  useEffect(() => {
    if (!selectedOffer && offers.length > 0) {
      setSelectedOfferId(offers[0].id);
    }
  }, [offers, selectedOffer]);

  useEffect(() => {
    if (
      selectedOffer &&
      (selectedOffer.offer_status === 'DELIVERED' ||
        selectedOffer.offer_status === 'PENDING') &&
      !viewedOfferIds.current.has(selectedOffer.id)
    ) {
      viewedOfferIds.current.add(selectedOffer.id);
      markOfferViewed(selectedOffer.id);
    }
  }, [
    selectedOffer?.id,
    selectedOffer?.offer_status,
    markOfferViewed,
  ]);

  if (flagLoading || offersQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Offers</CardTitle>
          <CardDescription>
            Loading post-appointment offers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Offers</CardTitle>
          <CardDescription>
            Post-appointment offers are not enabled for this tenant.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (offersQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Offers</CardTitle>
          <CardDescription>
            Unable to load offers right now.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (offers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Offers</CardTitle>
          <CardDescription>
            Completed appointments with approved recommendations will
            appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canAct =
    selectedOffer != null &&
    !['ACCEPTED', 'DECLINED', 'EXPIRED'].includes(
      selectedOffer.offer_status
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <Card>
        <CardHeader>
          <CardTitle>My Offers</CardTitle>
          <CardDescription>
            Review approved recommendations from completed
            appointments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {offers.map((offer) => (
            <button
              key={offer.id}
              type="button"
              className={`w-full rounded-lg border p-4 text-left transition ${
                selectedOffer?.id === offer.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
              onClick={() => setSelectedOfferId(offer.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {offer.recommendation.recommendation_type}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {offer.recommendation.category} - Appointment #
                    {offer.recommendation.appointment_id}
                  </p>
                </div>
                <Badge
                  variant={getOfferStatusVariant(offer.offer_status)}
                >
                  {offer.offer_status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Sent: {formatDate(offer.sent_at)}</span>
                <span>Expires: {formatDate(offer.expires_at)}</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedOffer ? (
        <Card>
          <CardHeader>
            <CardTitle>Offer Details</CardTitle>
            <CardDescription>
              Approved by your doctor after appointment completion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Badge
                variant={getOfferStatusVariant(
                  selectedOffer.offer_status
                )}
              >
                {selectedOffer.offer_status}
              </Badge>
              <h3 className="text-lg font-semibold">
                {selectedOffer.recommendation.recommendation_type}
              </h3>
              <p className="text-sm text-muted-foreground">
                Category: {selectedOffer.recommendation.category}
              </p>
              <p className="text-sm text-muted-foreground">
                Delivery: {selectedOffer.delivery_channel}
              </p>
              <p className="text-sm text-muted-foreground">
                Recommendation created:{' '}
                {formatDate(selectedOffer.recommendation.created_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                Offer expires: {formatDate(selectedOffer.expires_at)}
              </p>
            </div>

            {selectedOffer.acceptance ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                Accepted on{' '}
                {formatDate(selectedOffer.acceptance.accepted_at)}
                {selectedOffer.acceptance.redemption_method
                  ? ` via ${selectedOffer.acceptance.redemption_method}`
                  : ''}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  acceptOffer.mutate({
                    offerId: selectedOffer.id,
                    payload: {
                      redemption_method: 'IN_APP',
                      transaction_id: `offer-${selectedOffer.id}`,
                    },
                  })
                }
                disabled={!canAct || acceptOffer.isPending}
              >
                Accept Offer
              </Button>
              <Button
                variant="outline"
                onClick={() => declineOffer.mutate(selectedOffer.id)}
                disabled={!canAct || declineOffer.isPending}
              >
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
