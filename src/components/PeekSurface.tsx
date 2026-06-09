import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';

import { Input } from './Input';
import { Response } from './Response';
import { History } from './History';
import { usePeekStore } from '../store/peek';
import { useSettingsStore } from '../store/settings';
import { useHistoryStore, type Session } from '../store/history';
import { useStream } from '../hooks/useStream';
import { useShortcuts } from '../hooks/useShortcuts';
import { OllamaProvider } from '../providers/ollama';
import { peekVariants } from '../lib/motion';
import {
  createSession,
  saveMessage,
  updateSessionTitle,
  getRecentSessions,
  getSessionMessages,
  getLastUserMessage,
} from '../db/database';

function generateId(): string {
  return crypto.randomUUID();
}

export const PeekSurface: React.FC = () => {
  const {
    visible,
    setVisible,
    input,
    setInput,
    messages,
    addMessage,
    setMessages,
    activeSessionId,
    setActiveSessionId,
    streamingContent,
    isStreaming,
    backgroundTasks,
    addBackgroundTask,
    updateBackgroundTask,
    clear,
  } = usePeekStore();

  const { activeModel, setActiveModel, ollamaBaseUrl } = useSettingsStore();
  const { setSessions } = useHistoryStore();
  const { run: runStream, abort: abortStream } = useStream();

  const provider = useMemo(
    () => new OllamaProvider(ollamaBaseUrl),
    [ollamaBaseUrl]
  );

  const surfaceRef = useRef<HTMLDivElement>(null);

  // ── Discover models on mount ──
  useEffect(() => {
    const discover = async () => {
      const models = await provider.models();
      if (models.length > 0 && !activeModel) {
        setActiveModel(models[0]);
      }
    };
    discover();
  }, [provider, activeModel, setActiveModel]);

  // ── Load history on mount ──
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const sessions = await getRecentSessions();
        setSessions(sessions);
      } catch {
        // DB not ready yet — will load on next visibility
      }
    };
    loadHistory();
  }, [setSessions]);

  // ── Register global shortcut ──
  useEffect(() => {
    const shortcut = useSettingsStore.getState().hotkey;

    const setup = async () => {
      try {
        await register(shortcut, (event) => {
          if (event.state === 'Pressed') {
            invoke('toggle_peek');
          }
        });
      } catch (err) {
        console.warn('Failed to register global shortcut:', err);
      }
    };

    setup();

    return () => {
      unregister(shortcut).catch(() => {});
    };
  }, []);

  // ── Listen for visibility events from Rust ──
  useEffect(() => {
    const unlisten1 = listen<boolean>('peek-visibility', (event) => {
      setVisible(event.payload);
    });

    const unlisten2 = listen('peek-focus-lost', () => {
      // Only auto-hide if not streaming (background task takes over)
      if (!usePeekStore.getState().isStreaming) {
        invoke('hide_peek');
      }
    });

    return () => {
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
    };
  }, [setVisible]);

  // ── Dynamic window resize based on content ──
  useEffect(() => {
    if (!visible) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.min(Math.max(entry.contentRect.height + 16, 80), 520);
        invoke('resize_peek', { width: 660, height });
      }
    });

    if (surfaceRef.current) {
      resizeObserver.observe(surfaceRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [visible]);

  // ── Submit query ──
  const handleSubmit = useCallback(async () => {
    const query = input.trim();
    if (!query || !activeModel) return;

    const userMessage = { role: 'user' as const, content: query };
    addMessage(userMessage);
    setInput('');

    // Create session if needed
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = generateId();
      setActiveSessionId(sessionId);
      try {
        await createSession(sessionId, activeModel, 'ollama', query.slice(0, 80));
      } catch (err) {
        console.warn('Failed to create session:', err);
      }
    }

    // Save user message
    try {
      await saveMessage(generateId(), sessionId, 'user', query);
    } catch (err) {
      console.warn('Failed to save message:', err);
    }

    const allMessages = [...messages, userMessage];

    const onComplete = async (full: string) => {
      const assistantMessage = { role: 'assistant' as const, content: full };
      addMessage(assistantMessage);

      // Save assistant message
      try {
        await saveMessage(generateId(), sessionId!, 'assistant', full);
        // Update session title if first exchange
        if (allMessages.length <= 1) {
          await updateSessionTitle(sessionId!, query.slice(0, 80));
        }
        // Refresh history
        const sessions = await getRecentSessions();
        setSessions(sessions);
      } catch (err) {
        console.warn('Failed to save response:', err);
      }

      // Check if this was a background task completion
      const bgTask = usePeekStore
        .getState()
        .backgroundTasks.find(
          (t) => t.sessionId === sessionId && t.status === 'running'
        );
      if (bgTask) {
        updateBackgroundTask(bgTask.id, { status: 'complete', result: full });
        invoke('show_notification', {
          title: 'Peekaboo — Answer Ready',
          body: query.slice(0, 100),
        });
      }
    };

    const onError = (err: Error) => {
      const errorMessage = {
        role: 'assistant' as const,
        content: `⚠️ Error: ${err.message}`,
      };
      addMessage(errorMessage);
    };

    await runStream(provider, allMessages, activeModel, onComplete, onError);
  }, [
    input,
    activeModel,
    messages,
    activeSessionId,
    addMessage,
    setInput,
    setActiveSessionId,
    provider,
    runStream,
    setSessions,
    updateBackgroundTask,
  ]);

  // ── Escape handling ──
  const handleEscape = useCallback(() => {
    if (isStreaming) {
      // Dismiss to background — streaming continues
      const sessionId = activeSessionId;
      if (sessionId) {
        addBackgroundTask({
          id: generateId(),
          question: messages.find((m) => m.role === 'user')
            ? String(
                messages.filter((m) => m.role === 'user').pop()?.content ?? ''
              ).slice(0, 100)
            : 'Query',
          startedAt: Date.now(),
          status: 'running',
          sessionId,
        });
      }
      invoke('hide_peek');
    } else {
      invoke('hide_peek');
    }
  }, [isStreaming, activeSessionId, messages, addBackgroundTask]);

  // ── Clear conversation ──
  const handleClear = useCallback(() => {
    abortStream();
    clear();
  }, [abortStream, clear]);

  // ── Previous query ──
  const handlePreviousQuery = useCallback(async () => {
    try {
      const lastQuery = await getLastUserMessage();
      if (lastQuery) {
        setInput(lastQuery);
      }
    } catch {
      // DB not ready
    }
  }, [setInput]);

  // ── Load session from history ──
  const handleSelectSession = useCallback(
    async (session: Session) => {
      try {
        const msgs = await getSessionMessages(session.id);
        setMessages(
          msgs.map((m) => ({
            role: m.role,
            content: m.content,
          }))
        );
        setActiveSessionId(session.id);
        useHistoryStore.getState().setOpen(false);
      } catch (err) {
        console.warn('Failed to load session:', err);
      }
    },
    [setMessages, setActiveSessionId]
  );

  // ── Keyboard shortcuts ──
  useShortcuts({
    onSubmit: handleSubmit,
    onClear: handleClear,
    onEscape: handleEscape,
    onPreviousQuery: handlePreviousQuery,
  });

  // ── Ollama status check ──
  const [ollamaStatus, setOllamaStatus] = React.useState<
    'checking' | 'connected' | 'disconnected'
  >('checking');

  useEffect(() => {
    const check = async () => {
      const available = await provider.isAvailable();
      setOllamaStatus(available ? 'connected' : 'disconnected');
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [provider]);

  const hasResponse = streamingContent || messages.some((m) => m.role === 'assistant');
  const displayContent =
    streamingContent ||
    (messages.filter((m) => m.role === 'assistant').pop()?.content as string) ||
    '';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="peek-surface"
          ref={surfaceRef}
          variants={peekVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* History Panel */}
          <History onSelectSession={handleSelectSession} />

          {/* Main content */}
          <div className="peek-main">
            {/* Input */}
            <Input onSubmit={handleSubmit} />

            {/* Status bar */}
            <div className="peek-statusbar">
              <div className="peek-status-left">
                {ollamaStatus === 'disconnected' && (
                  <span className="peek-status-error">
                    Ollama not detected — is it running?
                  </span>
                )}
                {ollamaStatus === 'connected' && activeModel && (
                  <span className="peek-status-model">{activeModel}</span>
                )}
              </div>
              <div className="peek-status-right">
                {backgroundTasks.filter((t) => t.status === 'running').length >
                  0 && (
                  <span className="peek-bg-indicator">
                    <span className="peek-bg-dot" />
                    Background task running
                  </span>
                )}
              </div>
            </div>

            {/* Response */}
            {hasResponse && (
              <Response content={displayContent} isStreaming={isStreaming} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
