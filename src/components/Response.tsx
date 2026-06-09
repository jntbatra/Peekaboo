import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { responseVariants } from '../lib/motion';

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
          components={{
            // Custom renderers for premium feel
            code: ({ children, className, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return <code className="peek-inline-code" {...props}>{children}</code>;
              }
              return (
                <pre className="peek-code-block">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
            a: ({ children, href, ...props }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="peek-link"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && <span className="peek-cursor" />}
      </div>
    </motion.div>
  );
};
