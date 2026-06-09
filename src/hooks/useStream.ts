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
        if ((err as Error).name === 'AbortError') {
          // Deliberate abort — not an error
          // Final flush of whatever we have
          setStreamingContent(full);
          setIsStreaming(false);
          return full;
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
