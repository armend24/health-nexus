import { Button } from '@/components/ui/button';
import type { SubscriptionPlan } from '@/services/subscription-plans.service';
import { IconCheck } from '@tabler/icons-react';

/**
 * PlanCard Component
 * Individual plan card displaying pricing, features, and action button.
 * Shows "CURRENT PLAN" badge for user's active subscription with disabled state.
 * Shows "RECOMMENDED" badge for plans that fit current resource usage.
 * Shows availability status based on whether plan can accommodate current stats.
 */
export function PlanCard({
  plan,
  isCurrentPlan = false,
  isRecommended = false,
  canFitStats = true,
  onChangePlan,
  isChanging = false,
  isActionDisabled = false,
  changingLabel = 'Updating...',
  buttonLabel = 'Choose Plan',
}: {
  plan: SubscriptionPlan;
  isCurrentPlan?: boolean;
  isRecommended?: boolean;
  canFitStats?: boolean;
  onChangePlan?: (planId: number) => void;
  isChanging?: boolean;
  isActionDisabled?: boolean;
  changingLabel?: string;
  buttonLabel?: string;
}) {
  const price = parseFloat(plan.price);

  return (
    <div
      className={`relative rounded-lg border flex flex-col h-full min-h-100 transition-all group ${
        isCurrentPlan
          ? 'dark:border-green-500/50 dark:bg-green-950/20 dark:shadow-lg dark:shadow-green-500/20 border-green-300 bg-green-100 shadow-lg shadow-green-200/50 cursor-not-allowed'
          : isRecommended
            ? 'dark:border-blue-500 dark:bg-blue-950/20 border-blue-300 bg-blue-50 light:dark:text-gray-900'
            : !canFitStats
              ? 'dark:border-red-500/30 dark:bg-red-950/10 border-red-200 bg-red-50/50 opacity-75'
              : 'dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600 border-gray-300 bg-white hover:border-gray-400 light:dark:text-gray-900'
      }`}
      style={
        isCurrentPlan
          ? {
              padding: '2rem',
              boxShadow:
                'inset 0 1px 3px rgba(34, 197, 94, 0.1), 0 20px 25px -5px rgba(34, 197, 94, 0.1)',
            }
          : { padding: '1.5rem' }
      }
    >
      {/* Badge for current plan - shows when user already has this subscription */}
      {isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 dark:bg-green-600 dark:text-white bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
          CURRENT PLAN
        </div>
      )}

      {/* Badge for recommended plan - shows for plans that fit current stats */}
      {isRecommended && !isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 dark:bg-blue-600 dark:text-white bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
          RECOMMENDED
        </div>
      )}

      {/* Badge for unavailable plan - shows when plan can't fit current stats */}
      {!canFitStats && !isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 dark:bg-red-600 dark:text-white bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
          TOO SMALL
        </div>
      )}

      {/* Plan name and pricing section */}
      <div className="mb-4">
        <h3 className="text-xl font-bold mb-2 dark:text-white text-gray-900">
          {plan.name}
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold dark:text-white text-gray-900">
            ${price.toFixed(2)}
          </span>
          <span className="text-sm dark:text-zinc-400 text-gray-600">
            /month
          </span>
        </div>
      </div>

      {/* Features list with checkmarks */}
      <div className="space-y-4 flex-1">
        <div className="space-y-3 text-sm">
          {/* Display max doctors if available */}
          {plan.max_doctors && (
            <div className="flex items-start gap-3">
              <IconCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <span className="dark:text-gray-300 text-gray-700">
                {plan.max_doctors} doctors
              </span>
            </div>
          )}

          {/* Display max patients if available */}
          {plan.max_patients && (
            <div className="flex items-start gap-3">
              <IconCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <span className="dark:text-gray-300 text-gray-700">
                {plan.max_patients} patients
              </span>
            </div>
          )}

          {/* Display max departments if available */}
          {plan.max_departments && (
            <div className="flex items-start gap-3">
              <IconCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <span className="dark:text-gray-300 text-gray-700">
                {plan.max_departments} departments
              </span>
            </div>
          )}

          {/* Display billing cycle duration */}
          <div className="flex items-start gap-3">
            <IconCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <span className="dark:text-gray-300 text-gray-700">
              {plan.duration} days billing cycle
            </span>
          </div>
        </div>
      </div>

      {/* Action button - disabled if this is the current plan or too small */}
      <Button
        disabled={
          isCurrentPlan ||
          isChanging ||
          isActionDisabled ||
          !canFitStats
        }
        onClick={() => onChangePlan?.(plan.id)}
        className={`w-full mt-6 ${
          isCurrentPlan
            ? 'dark:bg-zinc-600 dark:hover:bg-zinc-600 dark:text-white dark:cursor-not-allowed dark:opacity-60 bg-gray-300 hover:bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
            : !canFitStats
              ? 'dark:bg-red-900 dark:hover:bg-red-900 dark:text-white dark:cursor-not-allowed dark:opacity-60 bg-red-200 hover:bg-red-200 text-red-700 cursor-not-allowed opacity-60'
              : isActionDisabled
                ? 'dark:bg-zinc-700 dark:hover:bg-zinc-700 dark:text-white dark:cursor-not-allowed dark:opacity-60 bg-gray-300 hover:bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
                : isRecommended
                  ? 'dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white bg-blue-500 hover:bg-blue-600 text-white'
                  : 'dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white bg-gray-800 hover:bg-gray-900 text-white'
        }`}
      >
        {isChanging ? changingLabel : buttonLabel}
      </Button>
    </div>
  );
}
