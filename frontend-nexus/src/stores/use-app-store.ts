import { create } from 'zustand';

interface AppState {
  count: number;
  userName: string;
  updateCount: (delta: number) => void;
  updateUserName: (name: string) => void;
  reset: () => void;
}

const initialState = {
  count: 0,
  userName: 'User',
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  updateCount: (delta) =>
    set((state) => ({
      count: state.count + delta,
    })),
  updateUserName: (name) => set({ userName: name }),
  reset: () => set(initialState),
}));
