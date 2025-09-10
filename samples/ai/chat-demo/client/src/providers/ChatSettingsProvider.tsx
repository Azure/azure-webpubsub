import React from "react";
import type { ReactNode } from "react";
import { ChatSettingsContext } from "../contexts/ChatSettingsContext";
import { DEFAULT_ROOM_ID, BACKEND_URL } from "../lib/constants";
import { getSelectedRoom, setSelectedRoom } from "../utils/storage";

interface ChatSettingsProviderProps {
  children: ReactNode;
}

export const ChatSettingsProvider: React.FC<ChatSettingsProviderProps> = ({ children }) => {
  // Simplify: always use a single default room
  const [roomId, setRoomId] = React.useState<string>(() => getSelectedRoom() ?? DEFAULT_ROOM_ID);
  const [rooms, setRooms] = React.useState<string[]>([DEFAULT_ROOM_ID]);
  const [userId, setUserId] = React.useState<string>("You");

  // On first load, fetch room list from server and merge with default
  React.useEffect(() => {
    type RoomInfo = { name?: string; messages?: number };
    type RoomsResponse = { rooms?: RoomInfo[] };
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/rooms`);
        if (!res.ok) return;
        const data = (await res.json()) as RoomsResponse;
        const serverRooms: string[] = (data.rooms ?? []).map((r) => r?.name).filter((n): n is string => typeof n === "string" && n.length > 0);
        // Only include rooms returned by the server (plus default)
        const merged = Array.from(new Set([DEFAULT_ROOM_ID, ...serverRooms]));
        if (!cancelled) {
          setRooms(merged);
          // Keep current selection; no forced override
        }
      } catch {
        // ignore fetch errors, keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist selected room to localStorage
  React.useEffect(() => {
    setSelectedRoom(roomId);
  }, [roomId]);

  // Add a new room by ID (no random generation)
  const addRoom = React.useCallback(
    (id?: string) => {
      const newId = id?.trim();
      if (!newId) {
        return roomId;
      }
      setRooms((prev) => (prev.includes(newId) ? prev : [...prev, newId]));
      setRoomId(newId);
      return newId;
    },
    [roomId],
  );

  // Remove a room by ID, fallback to public if current room removed
  const removeRoom = React.useCallback(
    (id?: string) => {
      const removeId = id?.trim();
      if (!removeId || removeId === DEFAULT_ROOM_ID) {
        return;
      }
      setRooms((prev) => prev.filter((r) => r !== removeId));
      if (roomId === removeId) {
        setRoomId(DEFAULT_ROOM_ID);
      }
    },
    [roomId],
  );

  const value = {
    roomId,
    setRoomId,
    rooms,
    setRooms,
    addRoom,
    removeRoom,
    userId,
    setUserId,
  };

  return <ChatSettingsContext.Provider value={value}>{children}</ChatSettingsContext.Provider>;
};
