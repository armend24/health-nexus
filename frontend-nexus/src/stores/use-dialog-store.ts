import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface DialogConfig {
  title?: string;
  content: ReactNode;
  /** Optional footer content (e.g. action buttons) */
  footer?: ReactNode;
  /** Hide the default close (X) button */
  showCloseButton?: boolean;
}

interface DialogState {
  isOpen: boolean;
  config: DialogConfig | null;
  open: (config: DialogConfig) => void;
  close: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  config: null,
  open: (config) => set({ isOpen: true, config }),
  close: () => set({ isOpen: false, config: null }),
}));
