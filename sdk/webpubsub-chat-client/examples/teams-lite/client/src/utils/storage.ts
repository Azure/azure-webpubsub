// Simple localStorage helpers for persisting chat settings

const SELECTED_ROOM_KEY = 'chat.selectedRoom';

export function getSelectedRoom(): string | undefined {
  try {
    const v = localStorage.getItem(SELECTED_ROOM_KEY);
    const trimmed = v?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function setSelectedRoom(roomId: string): void {
  try {
    localStorage.setItem(SELECTED_ROOM_KEY, roomId);
  } catch {
    // ignore
  }
}

export function clearSelectedRoom(): void {
  try {
    localStorage.removeItem(SELECTED_ROOM_KEY);
  } catch {
    // ignore
  }
}
