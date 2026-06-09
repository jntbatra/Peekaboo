import { create } from 'zustand';

interface SettingsState {
  hotkey: string;
  activeProvider: string;
  activeModel: string;
  ollamaBaseUrl: string;
  historyRetentionDays: number;
  isModelsOpen: boolean;

  setHotkey: (v: string) => void;
  setActiveModel: (v: string) => void;
  setOllamaBaseUrl: (v: string) => void;
  setModelsOpen: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  hotkey: 'Alt+Space',
  activeProvider: 'ollama',
  activeModel: '',
  ollamaBaseUrl: 'http://localhost:11434',
  historyRetentionDays: 90,
  isModelsOpen: false,

  setHotkey: (v) => set({ hotkey: v }),
  setActiveModel: (v) => set({ activeModel: v }),
  setOllamaBaseUrl: (v) => set({ ollamaBaseUrl: v }),
  setModelsOpen: (v) => set({ isModelsOpen: v }),
}));
