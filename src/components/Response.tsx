import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { responseVariants } from '../lib/motion';
import { markdownComponents } from '../lib/markdown';

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
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && <span className="peek-cursor" aria-hidden="true" />}
      </div>
    </motion.div>
  );
};

