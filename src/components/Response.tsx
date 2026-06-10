import React, { useRef, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { responseVariants } from '../lib/motion';

const MarkdownWrapper = React.lazy(() => import('../lib/MarkdownWrapper'));

interface ResponseProps {
  content: string;
  isStreaming: boolean;
}

export const Response: React.FC<ResponseProps> = ({ content, isStreaming }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabled = useRef(true);

  // Loading state: streaming started but no tokens received yet
  const isLoading = isStreaming && !content;

  // Auto-scroll to bottom during streaming, unless user has manually scrolled up
  useEffect(() => {
    if (isStreaming && containerRef.current && autoScrollEnabled.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    autoScrollEnabled.current = isAtBottom;
  };

  if (!content && !isLoading) return null;

  return (
    <motion.div
      className="peek-response"
      ref={containerRef}
      onScroll={handleScroll}
      variants={responseVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="peek-response-content">
        {isLoading ? (
          <div className="peek-loading-dots" aria-label="Thinking...">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <Suspense fallback={<div className="peek-loading-dots"><span /><span /><span /></div>}>
            <MarkdownWrapper>{content}</MarkdownWrapper>
          </Suspense>
        )}
        {/* Only show cursor while tokens are actively arriving — not before or after */}
        {isStreaming && content && <span className="peek-cursor" aria-hidden="true" />}
      </div>
    </motion.div>
  );
};
