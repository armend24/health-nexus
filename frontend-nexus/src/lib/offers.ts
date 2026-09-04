export function getOfferStatusVariant(status: string) {
  switch (status) {
    case 'ACCEPTED':
      return 'success';
    case 'DECLINED':
      return 'destructive';
    case 'EXPIRED':
      return 'expired';
    case 'VIEWED':
      return 'warning';
    default:
      return 'default';
  }
}

export function getNotificationNavigationTarget(notification: {
  type: string;
  entity_type: string | null;
  entity_id: number | null;
}) {
  if (
    notification.entity_type === 'offer_delivery' ||
    notification.type === 'OFFER_DELIVERED'
  ) {
    return {
      to: '/dashboard/client/$section',
      params: { section: 'offers' },
    };
  }

  if (
    notification.entity_type === 'appointment' &&
    notification.entity_id
  ) {
    return {
      to: '/appointments/$appointmentId',
      params: {
        appointmentId: String(notification.entity_id),
      },
    };
  }

  return null;
}
