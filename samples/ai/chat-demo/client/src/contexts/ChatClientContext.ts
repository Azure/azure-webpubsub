import { createContext } from 'react';
import type { WebPubSubClient } from '@azure/web-pubsub-client';

export interface ChatMessage {
  id: string;
  content: string;
  sender?: string;
  timestamp: string;
  isFromCurrentUser: boolean;
  streaming?: boolean;
  streamingEnd?: boolean;
  isPlaceholder?: boolean; // New flag for placeholder messages
}

export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message: string;
  connectionId?: string;
}

export interface ChatClientContextType {
  client: WebPubSubClient | null;
  connectionStatus: ConnectionStatus;
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  uiNotice?: { type: 'info' | 'error'; text: string };
}

export const ChatClientContext = createContext<ChatClientContextType | undefined>(undefined);
