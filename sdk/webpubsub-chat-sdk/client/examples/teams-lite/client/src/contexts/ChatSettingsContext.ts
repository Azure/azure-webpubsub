import { createContext } from 'react';
import type { ChatClient } from 'webpubsub-chat-sdk';

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
  addRoom: (client: ChatClient, roomName: string, memberIds?: string[]) => Promise<string>; // returns the created room id (server generates id)
  addUserToRoom: (client: ChatClient, roomId: string, userId: string) => Promise<void>; // admin adds a user to a room
  removeRoom: (roomId: string) => Promise<void>;
  updateRoom: (roomId: string, roomName: string, description?: string) => Promise<void>;
  userId?: string;
  setUserId: (userId: string) => void;
}

export const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);
