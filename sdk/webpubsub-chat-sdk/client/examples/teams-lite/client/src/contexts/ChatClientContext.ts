import { createContext } from 'react';
// import type { WebPubSubClient } from '@azure/web-pubsub-client';
import { ChatClient } from '@azure/web-pubsub-chat-client';

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

// Typing status related types
export interface TypingStatus {
  [visitorKey: string]: {
    // visitorKey format: "roomId:userId"
    isTyping: boolean;
    lastTyping: number; // timestamp
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
  typingStatus: TypingStatus;
  sendTypingIndicator: (roomId: string) => void;
  getTypingUsersForRoom: (roomId: string) => string[];
  successNotification: string;
  setSuccessNotification: (message: string) => void;
}

export const ChatClientContext = createContext<ChatClientContextType | undefined>(undefined);
