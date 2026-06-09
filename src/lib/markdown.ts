// Centralised markdown renderer configuration for Peekaboo
// Keeps renderer logic out of Response.tsx — easy to extend for syntax highlighting later

import React from 'react';
import type { Components } from 'react-markdown';

/**
 * Custom ReactMarkdown component renderers.
 * Designed to match the glassmorphic dark aesthetic of the Peekaboo surface.
 */
export const markdownComponents: Components = {
  // Code — inline vs block detection via className
  code: ({ children, className, ...props }) => {
    const isBlock = Boolean(className);
    if (!isBlock) {
      return (
        React.createElement('code', { className: 'peek-inline-code', ...props }, children)
      );
    }
    // Extract language label from "language-xxx" className
    const lang = className?.replace('language-', '') ?? '';
    return React.createElement(
      'pre',
      { className: 'peek-code-block', 'data-lang': lang },
      React.createElement('code', { className, ...props }, children)
    );
  },

  // Links — open externally, styled with underline on hover
  a: ({ children, href, ...props }) =>
    React.createElement(
      'a',
      {
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'peek-link',
        ...props,
      },
      children
    ),

  // Tables — full-width with border styling
  table: ({ children, ...props }) =>
    React.createElement(
      'div',
      { style: { overflowX: 'auto', margin: '0.75em 0' } },
      React.createElement('table', props, children)
    ),
};
