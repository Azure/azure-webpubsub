import React from "react";
import type { ReactNode } from "react";
import { ChatSettingsContext } from "../contexts/ChatSettingsContext";
import type { RoomMetadata } from "../contexts/ChatSettingsContext";
import { DEFAULT_ROOM_ID } from "../lib/constants";
import { getSelectedRoom, setSelectedRoom } from "../utils/storage";

interface ChatSettingsProviderProps {
  children: ReactNode;
}

export const ChatSettingsProvider: React.FC<ChatSettingsProviderProps> = ({ children }) => {
  const [roomId, setRoomId] = React.useState<string>(() => getSelectedRoom() ?? DEFAULT_ROOM_ID);
  const [rooms, setRooms] = React.useState<RoomMetadata[]>([]);
  const [userId, setUserId] = React.useState<string>("You");

  // On first load, fetch room metadata from server
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rooms', {
          headers: {
            'X-User-Id': userId,
          },
        });
        if (!res.ok) return;
        const data = await res.json() as { rooms: RoomMetadata[] };
        if (!cancelled) {
          setRooms(data.rooms || []);
        }
      } catch {
        // Fallback to default room only
        if (!cancelled) {
          setRooms([{
            roomId: DEFAULT_ROOM_ID,
            roomName: "Public Chat",
            userId: "system",
            description: "Default public room"
          }]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Persist selected room to localStorage
  React.useEffect(() => {
    setSelectedRoom(roomId);
  }, [roomId]);

  // Add a new room via API
  const addRoom = React.useCallback(
    async (roomName: string): Promise<string> => {
      try {
        const response = await fetch('/api/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          body: JSON.stringify({
            roomName: roomName.trim(),
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create room');
        }

        const newRoom = await response.json() as unknown as RoomMetadata;
        // Minimal runtime shape check (avoid missing fields crashing later)
        if (!newRoom || typeof newRoom !== 'object' || !('roomId' in newRoom) || !('roomName' in newRoom)) {
          throw new Error('Invalid room metadata received');
        }
        setRooms((prev) => [...prev, newRoom]);
        setRoomId(newRoom.roomId);
        return newRoom.roomId;
      } catch (error) {
        console.error('Failed to add room:', error);
        throw error;
      }
    },
    [userId],
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
    [userId, roomId],
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
    removeRoom,
    updateRoom,
    userId,
    setUserId,
  };

  return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>;
};
