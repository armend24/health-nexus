# Pages

## Public Tenant Landing

- Shows tenant branding, about content, departments, services, doctors, products, and plans.
- Used by clients to understand the tenant offering before registering or selecting a plan.
- Use `/tenants` to browse tenants.
- Use `/landing/$tenantSlug` for a specific tenant landing page when the slug is known.

## Enrollment

- Used when a client must register under a tenant and establish plan context.
- Route: `/enrollment`

## Appointment Booking

- Used by enrolled clients to select a doctor and book an appointment.
- Route: `/appointments/book`

## Dashboard Permissions

- Used by super admins to manage feature flags by plan and tenant override.
- Route: `/dashboard/permissions`

## Audit Logs

- Used by super admins to review audit log entries.
- Route: `/dashboard/audit-logs`

## Tenant Management

- Used by tenant managers to manage branding, doctors, services, products, plans, and contracts.
- Routes include `/dashboard/tenant/settings`, `/dashboard/tenant/plans`, and `/dashboard/tenant/enrollments`
