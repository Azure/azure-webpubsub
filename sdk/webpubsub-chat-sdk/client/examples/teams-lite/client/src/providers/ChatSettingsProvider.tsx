import React from "react";
import type { ReactNode } from "react";
import { ChatSettingsContext } from "../contexts/ChatSettingsContext";
import type { RoomMetadata } from "../contexts/ChatSettingsContext";
import { DEFAULT_ROOM_ID } from "../lib/constants";
import { setSelectedRoom } from "../utils/storage";
import type { ChatClient } from "webpubsub-chat-sdk";

interface ChatSettingsProviderProps {
  children: ReactNode;
}

export const ChatSettingsProvider: React.FC<ChatSettingsProviderProps> = ({ children }) => {
  // const [roomId, setRoomId] = React.useState<string>(() => getSelectedRoom() ?? DEFAULT_ROOM_ID);
  const [roomId, setRoomId] = React.useState<string>(() => "");
  const [rooms, setRooms] = React.useState<RoomMetadata[]>([]);
  const [userId, setUserId] = React.useState<string>("");

  // Persist selected room to localStorage
  React.useEffect(() => {
    setSelectedRoom(roomId);
  }, [roomId]);

  // Add a new room via API
  const addRoom = React.useCallback(
    async (client: ChatClient, roomName: string, memberIds: string[] = [], roomId: string | undefined = undefined): Promise<string> => {
      console.log(`client.createRoom, title: ${roomName}, id: ${roomId}, memberIds: [${memberIds.join(", ")}], client: `, client);

      return await client.createRoom(roomName, memberIds, roomId)
        .then((newRoom) => {
            setRoomId(newRoom.RoomId);
            return newRoom.RoomId;
        })
        .catch((error) => {
            console.error('AddRoomError:', error);
            throw error;
        });
    },
    [userId],
  );

  // Add user to an existing room via API (admin operation)
  const addUserToRoom = React.useCallback(
    async (client: ChatClient, roomIdToAdd: string, userId: string): Promise<void> => {
      try {
        console.log(`client.addUserToRoom, roomId: ${roomIdToAdd}, userId: ${userId}, client: `, client);
        
        await client.addUserToRoom(roomIdToAdd, userId);
        
        console.log('client.addUserToRoom succeeded');
        
        // Switch to the room after adding
        setRoomId(roomIdToAdd);
      } catch (error) {
        console.error('Failed to add user to room:', error);
        throw error;
      }
    },
    [setRoomId],
  );

  // Remove a room via API
  const removeRoom = React.useCallback(
    async (roomIdToRemove: string): Promise<void> => {
      if (roomIdToRemove === DEFAULT_ROOM_ID) {
        return; // Cannot remove default room
      }

      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomIdToRemove)}`, {
          method: 'DELETE',
          headers: {
            'X-User-Id': userId,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete room');
        }

        setRooms((prev) => prev.filter((r) => r.roomId !== roomIdToRemove));
        if (roomId === roomIdToRemove) {
          setRoomId(DEFAULT_ROOM_ID);
        }
      } catch (error) {
        console.error('Failed to remove room:', error);
        throw error;
      }
    },
    [setRoomId],
  );

  // Update a room via API
  const updateRoom = React.useCallback(
    async (roomIdToUpdate: string, roomName: string, description?: string): Promise<void> => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomIdToUpdate)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          body: JSON.stringify({
            roomName: roomName.trim(),
            description: description?.trim() || '',
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to update room');
        }

        const updatedRoom = await response.json() as unknown as RoomMetadata;
        if (!updatedRoom || typeof updatedRoom !== 'object' || updatedRoom.roomId !== roomIdToUpdate) {
          throw new Error('Invalid updated room metadata received');
        }
        setRooms((prev) => prev.map((r) => (r.roomId === roomIdToUpdate ? updatedRoom : r)));
      } catch (error) {
        console.error('Failed to update room:', error);
        throw error;
      }
    },
    [userId],
  );

  const value = {
    roomId,
    setRoomId,
    rooms,
    setRooms,
    addRoom,
    addUserToRoom,
    removeRoom,
    updateRoom,
    userId,
    setUserId,
  };

  return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>;
};
