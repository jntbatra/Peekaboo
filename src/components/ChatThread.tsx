import React, { useRef, useEffect, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import type { Message } from '../providers/types';

import type { Attachment } from '../hooks/useAttachments';

const MarkdownWrapper = React.lazy(() => import('../lib/MarkdownWrapper'));

interface ChatThreadProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  onClickAttachment?: (att: Attachment) => void;
}

function getTextContent(content: Message['content']): string {
  if (typeof content === 'string') {
    if (content.trim().startsWith('[') && content.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((p: any) => p.type === 'text' && p.text)
            .map((p: any) => p.text)
            .join('');
        }
      } catch (e) {
        // Not a JSON array, fall through
      }
    }
    return content;
  }
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('');
}

function parseUserContent(raw: string): { contexts: string[], prompt: string } {
  const contexts: string[] = [];
  let prompt = raw;
  let startIndex = prompt.indexOf('<context>');
  
  while (startIndex !== -1) {
    const endIndex = prompt.indexOf('</context>', startIndex + 9);
    if (endIndex !== -1) {
      contexts.push(prompt.substring(startIndex + 9, endIndex).trim());
      prompt = prompt.substring(0, startIndex) + prompt.substring(endIndex + 10);
      startIndex = prompt.indexOf('<context>');
    } else {
      break;
    }
  }
  
  return { contexts, prompt: prompt.trim() };
}

function CopyResponseButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      className="peek-copy-response-btn"
      onClick={handleCopy}
      title="Copy response"
      aria-label="Copy response"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  messages,
  streamingContent,
  isStreaming,
  onClickAttachment,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabled = useRef(true);

  // In reverse layout, "scroll to bottom" means the user sees the newest content
  // which is at the top of the scrollable area (column-reverse)
  useEffect(() => {
    if (isStreaming && autoScrollEnabled.current && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [streamingContent, isStreaming]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    // In column-reverse, scroll position 0 = newest content. 
    // User has scrolled away if scrollTop > threshold.
    autoScrollEnabled.current = containerRef.current.scrollTop < 40;
  };

  // Visible messages only (exclude system)
  const visible = messages.filter((m) => m.role !== 'system');

  // Pair messages into exchanges: [user, assistant]
  // We reverse so the most recent exchange appears at the top of the scroll container
  const pairs: Array<{ user?: Message; assistant?: Message; key: number }> = [];
  for (let i = 0; i < visible.length; i++) {
    if (visible[i].role === 'user') {
      pairs.push({ user: visible[i], assistant: visible[i + 1], key: i });
      i++; // skip the matched assistant
    }
  }
  const reversedPairs = [...pairs].reverse();

  const isLoading = isStreaming && !streamingContent;

  return (
    <div className="peek-thread" ref={containerRef} onScroll={handleScroll}>
      {/* Live streaming turn — appears at top in reversed layout */}
      {isStreaming && (
        <motion.div
          className="peek-thread-exchange"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="peek-thread-assistant">
            {isLoading ? (
              <div className="peek-loading-dots" aria-label="Thinking...">
                <span /><span /><span />
              </div>
            ) : (
              <Suspense fallback={<div className="peek-loading-dots"><span /><span /><span /></div>}>
                <MarkdownWrapper>{streamingContent}</MarkdownWrapper>
                <span className="peek-cursor" aria-hidden="true" />
              </Suspense>
            )}
          </div>
        </motion.div>
      )}

      {/* Completed exchanges, reversed so newest is at top */}
      {reversedPairs.map(({ user, assistant, key }) => (
        <motion.div
          key={key}
          className="peek-thread-exchange"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {assistant && (
            <div className="peek-thread-assistant">
              <Suspense fallback={<div className="peek-loading-dots"><span /><span /><span /></div>}>
                <MarkdownWrapper>{getTextContent(assistant.content)}</MarkdownWrapper>
              </Suspense>
              <CopyResponseButton text={getTextContent(assistant.content)} />
            </div>
          )}
          {user && (() => {
            const { contexts, prompt } = parseUserContent(getTextContent(user.content));
            return (
              <div className="peek-thread-user">
                {contexts.length > 0 && (
                  <div className="peek-thread-user-contexts">
                     {contexts.map((ctx, i) => {
                       const short = ctx.replace(/\s+/g, ' ').slice(0, 30);
                       const isClickable = ctx.length > 30;
                       return (
                         <div 
                           key={i} 
                           className={`peek-user-context-chip${isClickable ? ' peek-clickable' : ''}`} 
                           title={isClickable ? "Click to view full context" : undefined}
                           onClick={isClickable ? () => onClickAttachment?.({
                             id: `ctx-${i}-${Date.now()}`,
                             type: 'selection',
                             label: `Context: "${short}..."`,
                             content: ctx,
                             mediaType: 'text/plain'
                           }) : undefined}
                         >
                           ▤ {short}{isClickable ? '...' : ''}
                         </div>
                       );
                     })}
                  </div>
                )}
                <span className="peek-thread-user-bubble">{prompt}</span>
              </div>
            );
          })()}
        </motion.div>
      ))}
    </div>
  );
};
