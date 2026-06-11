import { useCallback, useRef } from 'react';
import type { Provider, Message } from '../providers/types';
import { usePeekStore } from '../store/peek';

export function useStream() {
  const {
    setStreamingContent,
    setIsStreaming,
  } = usePeekStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);

  const run = useCallback(
    async (
      provider: Provider,
      messages: Message[],
      model: string,
      onComplete?: (full: string) => void,
      onError?: (err: Error) => void
    ) => {
      // Abort any previous stream
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStreamingContent('');
      setIsStreaming(true);

      let full = '';
      let pendingUpdate = false;

      const scheduleUpdate = () => {
        if (!pendingUpdate) {
          pendingUpdate = true;
          rafRef.current = requestAnimationFrame(() => {
            setStreamingContent(full);
            pendingUpdate = false;
          });
        }
      };

      try {
        for await (const chunk of provider.stream(messages, model, controller.signal)) {
          full += chunk.delta;
          // Batch DOM updates to animation frames — never update per-token
          scheduleUpdate();

          if (chunk.done) break;
        }

        // Final flush
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setStreamingContent(full);
        setIsStreaming(false);
        onComplete?.(full);
      } catch (err) {
        // Cancel any pending rAF before touching any state
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        // Clean up any running background tasks since the stream stopped
        const store = usePeekStore.getState();
        store.backgroundTasks.forEach((t) => {
          if (t.status === 'running') {
            store.updateBackgroundTask(t.id, { status: 'error', result: 'aborted' });
          }
        });

        if ((err as Error).name === 'AbortError') {
          // Deliberate abort — not an error
          const finalFull = full + '\n\n*(Stopped by user)*';
          setStreamingContent(finalFull);
          setIsStreaming(false);
          onComplete?.(finalFull);
          return finalFull;
        }
        setIsStreaming(false);
        onError?.(err as Error);
      }

      return full;
    },
    [setStreamingContent, setIsStreaming]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { run, abort };
}
