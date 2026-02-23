import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App';
import { invokeCommand, isTauriRuntime } from './services/tauriBridge';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const dismissStartupSplash = () => {
  window.dispatchEvent(new CustomEvent('nexus:app-mounted'));
  const splash = document.getElementById('startup-splash');
  if (!splash) {
    return;
  }
  splash.classList.add('startup-splash--leave');
  window.setTimeout(() => {
    splash.remove();
  }, 360);
};

const notifyAppReady = async () => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invokeCommand<void>('app_ready');
  } catch (error) {
    console.error('Failed to notify app ready', error);
  }
};

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    void notifyAppReady().finally(() => {
      dismissStartupSplash();
    });
  });
});
