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
  const { sessions, isOpen } = useHistoryStore();

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
            <span className="peek-history-title">Recent</span>
            <kbd className="peek-kbd">⌘H</kbd>
          </div>
          <div className="peek-history-list">
            {sessions.length === 0 ? (
              <div className="peek-history-empty">No conversations yet</div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  className="peek-history-item"
                  onClick={() => onSelectSession(session)}
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
