import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHistoryStore, type Session } from '../store/history';
import { historyVariants } from '../lib/motion';

interface HistoryProps {
  onSelectSession: (session: Session) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const History: React.FC<HistoryProps> = ({ onSelectSession }) => {
  const { sessions, isOpen, setOpen } = useHistoryStore();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Reset selection when opened
  React.useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen]);

  // Scroll active item into view
  React.useEffect(() => {
    if (!scrollContainerRef.current) return;
    const activeEl = scrollContainerRef.current.children[selectedIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, sessions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (sessions.length > 0) {
          onSelectSession(sessions[selectedIndex]);
        }
      }
    };
    // Use capturing phase so it runs before generic app escape handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, setOpen, sessions, selectedIndex, onSelectSession]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="peek-history"
          variants={historyVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="peek-history-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="peek-history-title">Recent</span>
              <kbd className="peek-kbd">⌘H</kbd>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--peek-text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
                borderRadius: 4,
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--peek-text)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--peek-text-muted)')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="peek-history-list" ref={scrollContainerRef}>
            {sessions.length === 0 ? (
              <div className="peek-history-empty">No conversations yet</div>
            ) : (
              sessions.map((session, idx) => (
                <button
                  key={session.id}
                  className="peek-history-item"
                  style={{
                    background: idx === selectedIndex ? 'var(--peek-hover)' : 'transparent',
                  }}
                  onClick={() => onSelectSession(session)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="peek-history-item-title">
                    {session.title || 'Untitled'}
                  </span>
                  <span className="peek-history-item-meta">
                    <span className="peek-history-item-model">
                      {session.model}
                    </span>
                    <span className="peek-history-item-time">
                      {formatRelativeTime(session.updatedAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
