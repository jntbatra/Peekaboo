import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../store/settings';
import { historyVariants } from '../lib/motion';
import { OllamaProvider } from '../providers/ollama';

export const Models: React.FC = () => {
  const { activeModel, setActiveModel, isModelsOpen, setModelsOpen, ollamaBaseUrl } = useSettingsStore();
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Fetch models when opened
  React.useEffect(() => {
    if (isModelsOpen) {
      const provider = new OllamaProvider(ollamaBaseUrl);
      provider.models().then(setAvailableModels);
    }
  }, [isModelsOpen, ollamaBaseUrl]);

  // Reset selection when opened
  React.useEffect(() => {
    if (isModelsOpen) setSelectedIndex(0);
  }, [isModelsOpen]);

  // Scroll active item into view
  React.useEffect(() => {
    if (!scrollContainerRef.current) return;
    const activeEl = scrollContainerRef.current.children[selectedIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  React.useEffect(() => {
    if (!isModelsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setModelsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, availableModels.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (availableModels.length > 0) {
          setActiveModel(availableModels[selectedIndex]);
          setModelsOpen(false);
        }
      }
    };
    // Use capturing phase so it runs before generic app escape handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isModelsOpen, setModelsOpen, availableModels, selectedIndex, setActiveModel]);

  return (
    <AnimatePresence>
      {isModelsOpen && (
        <motion.div
          className="peek-history" // Reusing the history CSS class for consistent styling
          variants={historyVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="peek-history-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="peek-history-title">Models</span>
              <kbd className="peek-kbd">⌘M</kbd>
            </div>
            <button
              onClick={() => setModelsOpen(false)}
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
            {availableModels.length === 0 ? (
              <div className="peek-history-empty">No models available</div>
            ) : (
              availableModels.map((model, idx) => (
                <button
                  key={model}
                  className="peek-history-item"
                  style={{
                    background: idx === selectedIndex ? 'var(--peek-hover)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onClick={() => {
                    setActiveModel(model);
                    setModelsOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="peek-history-item-title">
                    {model}
                  </span>
                  {activeModel === model && <span style={{ fontSize: 12, color: '#4caf50' }}>Active</span>}
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
