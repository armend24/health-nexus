# Workflows

## Tenant Landing Setup

1. Tenant manager configures title, logo, image, colors, fonts, and content.
2. Public landing page shows tenant-specific departments, services, doctors, products, and plans.

## Client Enrollment

1. Client enters a tenant context.
2. Client registers as a patient if required.
3. Client selects a tenant plan.
4. Enrollment is created under that tenant.

## Appointment Booking

1. Client must be authenticated.
2. Client must have tenant context.
3. Client must be enrolled before booking.
4. Client selects doctor and time slot.
5. Appointment is created for the tenant-aware flow.

## Feature Flags

1. Super admin defines plan-level defaults.
2. Super admin can override per tenant.
3. Effective feature access resolves from plan defaults, then tenant override.
