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

// ---- Pedidos de alteração do texto do chat (outros módulos editam; o Chat Log é o dono do estado) ----

type TextListener = (text: string) => void;
const textListeners = new Set<TextListener>();

/** Pede ao Chat Log para trocar o texto do chat (ex.: edição feita no GIF Lab). */
export const requestChatText = (text: string): void => {
  textListeners.forEach(fn => fn(text));
};

export const subscribeChatTextRequests = (fn: TextListener): (() => void) => {
  textListeners.add(fn);
  return () => { textListeners.delete(fn); };
};
