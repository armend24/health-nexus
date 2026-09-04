import { evaluateFlag } from '@/lib/feature-flags';
import { create } from 'zustand';

interface FeatureFlagEntry {
  enabled: boolean;
  loading: boolean;
}

interface FeatureFlagsState {
  tenantScope: string | undefined;
  flags: Record<string, FeatureFlagEntry>;
  setTenantScope: (scope: string | undefined) => void;
  ensureFlag: (featureKey: string) => Promise<void>;
  ensureFlags: (featureKeys: string[]) => Promise<void>;
  reset: () => void;
}

const loadingEntry: FeatureFlagEntry = {
  enabled: false,
  loading: true,
};

export const useFeatureFlagsStore = create<FeatureFlagsState>(
  (set, get) => ({
    tenantScope: undefined,
    flags: {},

    setTenantScope: (scope) => {
      if (get().tenantScope === scope) return;
      set({
        tenantScope: scope,
        flags: {},
      });
    },

    ensureFlag: async (featureKey) => {
      const current = get().flags[featureKey];
      if (current && !current.loading) return;

      set((state) => ({
        flags: {
          ...state.flags,
          [featureKey]: current ?? loadingEntry,
        },
      }));

      try {
        const result = await evaluateFlag(featureKey);
        set((state) => ({
          flags: {
            ...state.flags,
            [featureKey]: {
              enabled: result.enabled,
              loading: false,
            },
          },
        }));
      } catch {
        set((state) => ({
          flags: {
            ...state.flags,
            [featureKey]: {
              enabled: false,
              loading: false,
            },
          },
        }));
      }
    },

    ensureFlags: async (featureKeys) => {
      await Promise.all(
        featureKeys.map((featureKey) => get().ensureFlag(featureKey))
      );
    },

    reset: () => {
      set({
        flags: {},
      });
    },
  })
);
