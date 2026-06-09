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
      const isMod = e.ctrlKey || e.metaKey;

      // Enter → Submit (without Shift)
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

      // Cmd/Ctrl+K → Clear conversation
      if (isMod && e.key === 'k') {
        e.preventDefault();
        handlers.onClear();
        return;
      }

      // Cmd/Ctrl+H → Toggle history
      if (isMod && e.key === 'h') {
        e.preventDefault();
        useHistoryStore.getState().toggleOpen();
        return;
      }

      // Cmd/Ctrl+, → Open settings
      if (isMod && e.key === ',') {
        e.preventDefault();
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('open_settings');
        });
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
