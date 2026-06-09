import React, { useRef, useEffect, useCallback } from 'react';
import { usePeekStore } from '../store/peek';

interface InputProps {
  onSubmit: () => void;
}

export const Input: React.FC<InputProps> = ({ onSubmit }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { input, setInput, isStreaming, visible } = usePeekStore();

  // Auto-focus when overlay becomes visible
  useEffect(() => {
    if (visible && textareaRef.current) {
      // Small delay to ensure the window is fully focused
      const timer = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Max 4 lines (~96px), then scroll
    const maxHeight = 96;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (input.trim() && !isStreaming) {
        onSubmit();
      }
    }
  };

  return (
    <div className="peek-input-container">
      <div className="peek-input-icon">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>
      <textarea
        ref={textareaRef}
        className="peek-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything..."
        rows={1}
        disabled={isStreaming}
        spellCheck={false}
        autoComplete="off"
      />
      {isStreaming && (
        <div className="peek-input-status">
          <div className="peek-streaming-dot" />
        </div>
      )}
      {!isStreaming && input.trim() && (
        <div className="peek-input-hint">
          <kbd>↵</kbd>
        </div>
      )}
    </div>
  );
};
