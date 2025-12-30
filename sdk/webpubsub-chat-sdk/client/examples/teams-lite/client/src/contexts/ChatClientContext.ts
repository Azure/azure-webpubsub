import { createContext } from 'react';
// import type { WebPubSubClient } from '@azure/web-pubsub-client';
import { ChatClient } from 'webpubsub-chat-sdk';

export interface ChatMessage {
  id: string;
  content: string;
  sender?: string;
  timestamp: string;
  isFromCurrentUser: boolean;
  isAcked?: boolean; // Whether the message has been acknowledged by the server (only meaningful for isFromCurrentUser=true)
  streaming?: boolean;
  streamingEnd?: boolean;
  isPlaceholder?: boolean; // New flag for placeholder messages
}

export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message: string;
  connectionId?: string;
  userId?: string;
}

// Online status related types
export interface OnlineStatus {
  [userId: string]: {
    isOnline: boolean;
    lastSeen: number; // timestamp
  };
}

export interface ChatClientContextType {
  client: ChatClient | null;
  connectionStatus: ConnectionStatus;
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  uiNotice?: { type: 'info' | 'error'; text: string };
  unreadCounts: Record<string, number>;
  getLastMessageForRoom: (roomId: string) => ChatMessage | null;
  roomMessagesUpdateTrigger: number;
  onlineStatus: OnlineStatus;
}

export const ChatClientContext = createContext<ChatClientContextType | undefined>(undefined);
