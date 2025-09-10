import { createContext } from 'react';

export interface ChatSettingsContextType {
  roomId: string;
  setRoomId: (roomId: string) => void;
  rooms: string[];
  setRooms: (rooms: string[]) => void;
  addRoom: (roomId?: string) => string; // returns the created/added room id
  removeRoom: (roomId: string) => void;
  userId?: string;
  setUserId: (userId: string) => void;
}

export const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);
