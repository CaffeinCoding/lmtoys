import { create } from 'zustand';

interface AppState {
  currentPdfPath: string | null;
  setCurrentPdfPath: (path: string | null) => void;
  // TODO: Add more state (cloud API keys, local model settings, extracted data)
}

export const useAppStore = create<AppState>((set) => ({
  currentPdfPath: null,
  setCurrentPdfPath: (path) => set({ currentPdfPath: path }),
}));
