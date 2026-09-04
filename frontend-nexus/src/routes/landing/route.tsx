/**
 * Public layout for /landing/* – no auth required.
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/landing')({
  component: LandingLayout,
});

function LandingLayout() {
  return <Outlet />;
}
