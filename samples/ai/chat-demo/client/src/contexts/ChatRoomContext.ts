import { createContext } from 'react';

export interface ChatRoomContextType {
  roomName: string;
  participantCount: number;
  isTyping: boolean;
  typingUsers: string[];
}

export const ChatRoomContext = createContext<ChatRoomContextType | undefined>(undefined);
