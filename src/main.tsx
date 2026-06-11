import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';

import './index.css';
import { PeekSurface } from './components/PeekSurface';
import { Settings } from './components/Settings';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './store/settings';

const App: React.FC = () => {
  const [windowLabel, setWindowLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const appWindow = getCurrentWebviewWindow();
      setWindowLabel(appWindow.label);
    } catch (e) {
      console.warn("Failed to get window label, defaulting to peekaboo");
      setWindowLabel('peekaboo');
    }
  }, []);

  // ── Sync Settings to Rust Backend ──
  React.useEffect(() => {
    if (windowLabel !== 'peekaboo') return;

    const sync = async () => {
      try {
        const { autoCaptureSelection } = useSettingsStore.getState();
        await invoke('update_settings', {
          settings: {
            auto_capture_selection: autoCaptureSelection
          }
        });
      } catch (err) {
        console.error('Failed to sync initial settings to Rust:', err);
      }
    };
    sync();

    // Subscribe to future settings changes
    const unsubscribe = useSettingsStore.subscribe((state) => {
      invoke('update_settings', {
        settings: {
          auto_capture_selection: state.autoCaptureSelection
        }
      }).catch(err => console.error('Failed to sync settings to Rust:', err));
    });

    return () => unsubscribe();
  }, [windowLabel]);

  if (!windowLabel) return null;

  return windowLabel === 'settings' ? <Settings /> : <PeekSurface />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
