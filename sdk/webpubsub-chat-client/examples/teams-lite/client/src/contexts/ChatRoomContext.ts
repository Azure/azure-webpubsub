import { createContext } from 'react';

export interface ChatRoom {
  id: string;
  name: string;
}

export interface ChatRoomContextType {
  room: ChatRoom | null;
}

export const ChatRoomContext = createContext<ChatRoomContextType | undefined>(undefined);
