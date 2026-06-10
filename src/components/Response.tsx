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

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  if (!content) return null;

  return (
    <motion.div
      className="peek-response"
      ref={containerRef}
      variants={responseVariants}
      initial="hidden"
      animate="visible"
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

