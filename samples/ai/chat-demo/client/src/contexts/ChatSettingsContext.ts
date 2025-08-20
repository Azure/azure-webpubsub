import { createContext } from 'react';

export interface ChatSettingsContextType {
  roomId: string;
  setRoomId: (roomId: string) => void;
}

export const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);
