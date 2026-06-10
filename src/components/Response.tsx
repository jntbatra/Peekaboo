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

  // Auto-scroll to bottom during streaming, but only if the user hasn't manually scrolled up
  useEffect(() => {
    if (isStreaming && containerRef.current && autoScrollEnabled.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Check if we are within ~20px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    autoScrollEnabled.current = isAtBottom;
  };

  if (!content) return null;

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
        <Suspense fallback={<div className="peek-cursor" aria-hidden="true" />}>
          <MarkdownWrapper>{content}</MarkdownWrapper>
        </Suspense>
        {isStreaming && <span className="peek-cursor" aria-hidden="true" />}
      </div>
    </motion.div>
  );
};

