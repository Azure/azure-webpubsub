import { createContext } from 'react';

export interface ChatSettingsContextType {
  roomId: string;
  setRoomId: (roomId: string) => void;
  enableTypingIndicators: boolean;
  setEnableTypingIndicators: (enabled: boolean) => void;
  enableMessageHistory: boolean;
  setEnableMessageHistory: (enabled: boolean) => void;
}

export const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);
