import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauriRuntime } from './tauriBridge';

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) {
    return;
  }

  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
