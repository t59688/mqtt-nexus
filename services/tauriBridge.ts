import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const TAURI_RUNTIME_FLAG = '__TAURI_INTERNALS__';

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && TAURI_RUNTIME_FLAG in window;

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required for MQTT operations.');
  }
  return invoke<T>(command, args);
}

export async function listenEvent<T>(
  eventName: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const unlisten = await listen<T>(eventName, (event) => {
    handler(event.payload);
  });

  return unlisten;
}
