import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePeekStore } from '../store/peek';
import { historyVariants } from '../lib/motion';
import { saveMemory, deleteMemory, updateMemory } from '../db/database';

function generateId(): string {
  return crypto.randomUUID();
}

export const MemoryOverlay: React.FC = () => {
  const { memoryOverlay, setMemoryOverlay } = usePeekStore();
  const { isOpen, title, items } = memoryOverlay;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Copy indicator state
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setIsSearchVisible(false);
      setSelectedIndex(0);
      setEditingId(null);
      setCopiedText(null);
    }
  }, [isOpen]);

  const exactMatch = items.find(i => i.content.toLowerCase() === searchQuery.trim().toLowerCase());
  const showSaveOption = searchQuery.trim() && !exactMatch;
  
  const filteredItems = items.filter(i => i.content.toLowerCase().includes(searchQuery.toLowerCase()));
  
  // Prepend a "Save" action if the user typed a new string
  const displayItems = showSaveOption 
    ? [
        { id: 'save-action', isSaveAction: true, content: searchQuery.trim() },
        ...filteredItems.map(item => ({ id: item.id, isSaveAction: false, content: item.content }))
      ]
    : filteredItems.map(item => ({ id: item.id, isSaveAction: false, content: item.content }));

  // Auto-focus edit input
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!isOpen || editingId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      
      // Auto-show search on typing
      if (!isSearchVisible && e.key.length === 1) {
        setIsSearchVisible(true);
        setSearchQuery((prev) => prev + e.key);
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        if (isSearchVisible && searchQuery) {
          e.preventDefault();
          e.stopPropagation();
          setSearchQuery('');
          setIsSearchVisible(false);
        } else {
          e.preventDefault();
          e.stopPropagation();
          setMemoryOverlay({ isOpen: false });
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, displayItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (displayItems.length > 0) {
          const selected = displayItems[selectedIndex];
          if (selected.isSaveAction) {
            // Save it
            saveMemory(generateId(), selected.content).then(() => {
              // Reload memories
              import('../db/database').then(({ searchMemories }) => {
                searchMemories('').then(memories => {
                  setMemoryOverlay({ items: memories.map(m => ({ id: m.id, content: m.content })) });
                });
              });
              setSearchQuery('');
              setIsSearchVisible(false);
            });
          } else {
            // Copy it
            navigator.clipboard.writeText(selected.content);
            setCopiedText(selected.content);
            setTimeout(() => setCopiedText(null), 2000);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, setMemoryOverlay, isSearchVisible, searchQuery, displayItems, selectedIndex, items, editingId]);

  // Focus search input when it becomes visible
  useEffect(() => {
    if (isSearchVisible && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchVisible]);

  // Scroll to selected item
  useEffect(() => {
    if (scrollContainerRef.current) {
      const selectedEl = scrollContainerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        const container = scrollContainerRef.current;
        const top = selectedEl.offsetTop;
        const bottom = top + selectedEl.offsetHeight;
        if (top < container.scrollTop) {
          container.scrollTop = top;
        } else if (bottom > container.scrollTop + container.offsetHeight) {
          container.scrollTop = bottom - container.offsetHeight;
        }
      }
    }
  }, [selectedIndex]);

  const handleEditSubmit = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (editContent.trim()) {
      await updateMemory(id, editContent.trim());
      // Reload memories
      const { searchMemories: reload } = await import('../db/database');
      const memories = await reload('');
      setMemoryOverlay({ items: memories.map(m => ({ id: m.id, content: m.content })) });
    }
    setEditingId(null);
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteMemory(id);
    // Reload memories
    const { searchMemories: reload } = await import('../db/database');
    const memories = await reload('');
    setMemoryOverlay({ items: memories.map(m => ({ id: m.id, content: m.content })) });
    setSelectedIndex((i) => Math.max(0, Math.min(i, memories.length - 1)));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="peek-history"
          variants={historyVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ zIndex: 105, position: 'absolute' }}
        >
          <div className="peek-history-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="peek-history-title">{title}</span>
            </div>
            <button
              onClick={() => setMemoryOverlay({ isOpen: false })}
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
          
          <AnimatePresence>
            {isSearchVisible && (
              <motion.div 
                className="peek-history-search"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                <input 
                  ref={searchInputRef}
                  type="text" 
                  placeholder="Search or save memory..." 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.altKey || e.ctrlKey || e.metaKey) return;
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') {
                      e.stopPropagation();
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="peek-history-list" ref={scrollContainerRef} style={{ position: 'relative' }}>
            {displayItems.length === 0 ? (
              <div className="peek-history-empty" style={{ paddingTop: 16 }}>
                Nothing found
              </div>
            ) : (
              displayItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="peek-history-item"
                  style={{
                    background: idx === selectedIndex && editingId !== item.id ? 'var(--peek-hover)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {editingId === item.id ? (
                    <form 
                      onSubmit={(e) => handleEditSubmit(e, item.id)}
                      style={{ width: '100%', display: 'flex' }}
                    >
                      <input
                        ref={editInputRef}
                        className="peek-history-edit-input"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onBlur={(e) => handleEditSubmit(e, item.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingId(null);
                            if (searchInputRef.current) searchInputRef.current.focus();
                          }
                        }}
                        style={{
                          width: '100%',
                          background: 'var(--peek-bg)',
                          border: '1px solid var(--peek-border)',
                          color: 'var(--peek-text)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                    </form>
                  ) : (
                    <>
                      <button
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          margin: 0,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flex: 1,
                          color: 'inherit',
                          fontFamily: 'inherit',
                        }}
                        onClick={() => {
                          if (item.isSaveAction) {
                            saveMemory(generateId(), item.content).then(() => {
                              import('../db/database').then(({ searchMemories }) => {
                                searchMemories('').then(memories => {
                                  setMemoryOverlay({ items: memories.map(m => ({ id: m.id, content: m.content })) });
                                });
                              });
                              setSearchQuery('');
                              setIsSearchVisible(false);
                            });
                          } else {
                            navigator.clipboard.writeText(item.content);
                            setCopiedText(item.content);
                            setTimeout(() => setCopiedText(null), 2000);
                          }
                        }}
                      >
                        {item.isSaveAction ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--peek-text-muted)', flexShrink: 0 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                        <span className="peek-history-item-title" style={{ whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>
                          {item.isSaveAction ? <><span style={{ color: 'var(--peek-text-muted)' }}>Save memory:</span> {item.content}</> : item.content}
                        </span>
                      </button>

                      {!item.isSaveAction && (
                        <div className="peek-history-item-actions">
                          <div 
                            className="peek-history-action-btn"
                            title="Edit memory"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditContent(item.content);
                              setEditingId(item.id);
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"></path>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                            </svg>
                          </div>
                          <div 
                            className="peek-history-action-btn"
                            title="Delete memory"
                            onClick={(e) => handleDelete(e, item.id)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
            
            {/* Copied indicator pill */}
            <AnimatePresence>
              {copiedText && (
                <motion.div
                  initial={{ opacity: 0, y: 10, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: 10, x: '-50%' }}
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    left: '50%',
                    backgroundColor: 'rgba(20, 20, 20, 0.95)',
                    border: '1px solid var(--peek-border)',
                    color: 'var(--peek-text)',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 500,
                    pointerEvents: 'none',
                    zIndex: 200,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Copied to clipboard!</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
