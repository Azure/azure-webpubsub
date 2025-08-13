import { createContext } from 'react';

export interface RoomMetadata {
  roomId: string;
  roomName: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
}

export interface ChatSettingsContextType {
  roomId: string;
  setRoomId: (roomId: string) => void;
  rooms: RoomMetadata[];
  setRooms: (rooms: RoomMetadata[]) => void;
  addRoom: (roomName: string) => Promise<string>; // returns the created room id (server generates id)
  removeRoom: (roomId: string) => Promise<void>;
  updateRoom: (roomId: string, roomName: string, description?: string) => Promise<void>;
  userId?: string;
  setUserId: (userId: string) => void;
}

export const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);
