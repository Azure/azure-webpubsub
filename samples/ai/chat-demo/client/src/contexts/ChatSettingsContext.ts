import { createContext } from 'react';

export interface ChatSettingsContextType {
  roomId: string;
  setRoomId: (roomId: string) => void;
  rooms: string[];
  addRoom: (roomId?: string) => string; // returns the created/added room id
  removeRoom: (roomId: string) => void;
}

export const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);
