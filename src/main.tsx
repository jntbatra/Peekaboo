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

  if (!windowLabel) return null;

  return windowLabel === 'settings' ? <Settings /> : <PeekSurface />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
