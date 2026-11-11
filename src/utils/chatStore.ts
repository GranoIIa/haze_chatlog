import type { ChatStyle } from './chatRenderer';

/**
 * Chat atual publicado pelo Chat Log para os outros módulos (ex.: GIF Lab).
 * `refWidth/refHeight` são as dimensões do canvas em que `style.chatPos` foi definido.
 */
export interface SharedChat {
  style: ChatStyle;
  refWidth: number;
  refHeight: number;
}

let current: SharedChat | null = null;
const listeners = new Set<() => void>();

export const publishChat = (next: SharedChat): void => {
  current = next;
  listeners.forEach(fn => fn());
};

// Assinatura compatível com useSyncExternalStore
export const getSharedChat = (): SharedChat | null => current;

export const subscribeSharedChat = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
