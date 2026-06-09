import React, { useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePeekStore } from '../store/peek';

interface InputProps {
  onSubmit: () => void;
  onAttachImage?: (base64: string, mediaType: string) => void;
}

export const Input: React.FC<InputProps> = ({ onSubmit, onAttachImage }) => {
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

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAttachImage) return;
    
    try {
      // Use our native Rust implementation to get the image as Base64 PNG.
      // This bypasses WebKitGTK's buggy clipboard integration on Wayland.
      const base64 = await invoke<string>('read_clipboard_image');
      if (base64) {
        e.preventDefault();
        onAttachImage(base64, 'image/png');
      }
    } catch (err) {
      // No image in clipboard or unsupported format; let normal text paste proceed
      console.log('No image in clipboard or failed to read:', err);
    }
  }, [onAttachImage]);

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
        onPaste={handlePaste}
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
