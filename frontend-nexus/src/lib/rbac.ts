/**
 * Centralized RBAC using the route–role matrix. Use can() for guards and UI.
 */
import { canAccess, type Role, type RouteKey } from './rbacMatrix';

/** User shape with optional role (e.g. auth store user + role). */
export interface UserWithRole {
  role?: Role | null;
}

/** True if user has permission to access the given route key. */
export function can(
  user: UserWithRole | null | undefined,
  permission: RouteKey
): boolean {
  return canAccess(user?.role ?? undefined, permission);
}

export {
  canAccess,
  getAllowedRoles,
  type Role,
  type RouteKey,
} from './rbacMatrix';
