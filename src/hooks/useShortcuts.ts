import { useEffect } from 'react';
import { usePeekStore } from '../store/peek';
import { useHistoryStore } from '../store/history';

type KeyHandler = (e: KeyboardEvent) => void;

interface ShortcutHandlers {
  onSubmit: () => void;
  onClear: () => void;
  onEscape: () => void;
  onPreviousQuery: () => void;
}

export function useShortcuts(handlers: ShortcutHandlers) {
  const { visible } = usePeekStore();

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown: KeyHandler = (e) => {
      const isMod = e.altKey;

      // Enter → Submit (without Shift or Alt)
      if (e.key === 'Enter' && !e.shiftKey && !isMod) {
        e.preventDefault();
        handlers.onSubmit();
        return;
      }

      // Escape → Dismiss
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onEscape();
        return;
      }

      // Alt+K → Clear conversation
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.onClear();
        return;
      }

      // Alt+H → Toggle history
      if (isMod && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        useHistoryStore.getState().toggleOpen();
        return;
      }

      // Alt+, → Open settings
      if (isMod && e.key === ',') {
        e.preventDefault();
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('open_settings');
        });
        return;
      }

      // Alt+/ → Toggle legend
      if (isMod && e.key === '/') {
        e.preventDefault();
        const store = usePeekStore.getState();
        store.setLegendOpen(!store.isLegendOpen);
        return;
      }

      // Up arrow (empty input) → Previous query
      if (e.key === 'ArrowUp') {
        const input = usePeekStore.getState().input;
        if (!input.trim()) {
          e.preventDefault();
          handlers.onPreviousQuery();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handlers]);
}
