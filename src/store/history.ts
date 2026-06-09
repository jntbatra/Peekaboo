import { create } from 'zustand';

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string | null;
  model: string;
  providerId: string;
}

export interface HistoryMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  hasAttachment: boolean;
}

interface HistoryState {
  sessions: Session[];
  isOpen: boolean;
  setSessions: (sessions: Session[]) => void;
  addSession: (s: Session) => void;
  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  sessions: [],
  isOpen: false,
  setSessions: (sessions) => set({ sessions }),
  addSession: (s) => set((state) => ({ sessions: [s, ...state.sessions] })),
  setOpen: (v) => set({ isOpen: v }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
}));
