import { create } from 'zustand';

import { persist } from 'zustand/middleware';

interface SettingsState {
  activeProvider: string;
  activeModel: string;
  ollamaBaseUrl: string;
  historyRetentionDays: number;
  isModelsOpen: boolean;
  systemPrompt: string;
  autoCaptureSelection: boolean;

  setActiveModel: (v: string) => void;
  setOllamaBaseUrl: (v: string) => void;
  setModelsOpen: (v: boolean) => void;
  setSystemPrompt: (v: string) => void;
  setAutoCaptureSelection: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      activeProvider: 'ollama',
      activeModel: '',
      ollamaBaseUrl: 'http://localhost:11434',
      historyRetentionDays: 90,
      isModelsOpen: false,
      systemPrompt: 'You are Peekaboo, a highly capable, concise, and helpful AI desktop assistant. Do not use conversational filler. Provide direct, accurate answers.',
      autoCaptureSelection: true,

      setActiveModel: (v) => set({ activeModel: v }),
      setOllamaBaseUrl: (v) => set({ ollamaBaseUrl: v }),
      setModelsOpen: (v) => set({ isModelsOpen: v }),
      setSystemPrompt: (v) => set({ systemPrompt: v }),
      setAutoCaptureSelection: (v) => set({ autoCaptureSelection: v }),
    }),
    {
      name: 'peekaboo-settings',
    }
  )
);

// Synchronize state across Webview instances (Settings window -> Main window)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'peekaboo-settings') {
      useSettingsStore.persist.rehydrate();
    }
  });
}
