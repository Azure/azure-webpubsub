/**
 * Generates a random room ID
 */
export const generateRoomId = (): string => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return `room-${result}`;
};

/**
 * Gets room ID from URL parameters, or generates a new one
 */
export const getRoomIdFromUrl = (): string => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdParam = urlParams.get('roomId');
  
  if (roomIdParam) {
    return roomIdParam;
  }
  
  return generateRoomId();
};

/**
 * Updates the browser URL with the room ID
 */
export const updateUrlWithRoomId = (roomId: string): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('roomId', roomId);
  window.history.replaceState({}, '', url.toString());
};
