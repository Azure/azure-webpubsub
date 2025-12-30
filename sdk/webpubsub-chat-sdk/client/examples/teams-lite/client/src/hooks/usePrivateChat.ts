import { useContext, useCallback } from 'react';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { useChatClient } from './useChatClient';

export const usePrivateChat = () => {
  const clientContext = useContext(ChatClientContext);
  const settingsContext = useContext(ChatSettingsContext);
  const { connectionStatus } = useChatClient();

  const createOrJoinPrivateChat = useCallback(async (targetUserId: string) => {
    const currentUserId = connectionStatus.userId || settingsContext?.userId;
    if (!currentUserId || !clientContext?.client || !settingsContext) {
      console.error('Missing required data for private chat');
      return;
    }
    
    // Don't allow clicking on self
    if (targetUserId === currentUserId) {
      return;
    }
    
    // Generate room ID for private chat, use alphabetical order to ensure consistency
    const [uid0, uid1] = [currentUserId, targetUserId].sort();
    const privateRoomId = `private-${uid0}-${uid1}`;
    const privateRoomName = `${uid0} <-> ${uid1}`;
    
    try {
      // Check if room already exists in client's rooms
      const existingRoom = clientContext.client.rooms.find(r => r.RoomId === privateRoomId);
      
      if (existingRoom) {
        // Room exists, just switch to it
        console.log('Switching to existing private room:', privateRoomId);
        settingsContext.setRoomId(privateRoomId);
      } else {
        // Room doesn't exist, create it
        console.log('Creating new private room:', privateRoomId);
        const newRoom = await clientContext.client.createRoom(privateRoomName, [targetUserId], privateRoomId);
        console.log('Created private room:', newRoom);
        
        // Switch to new room
        settingsContext.setRoomId(privateRoomId);
      }
    } catch (error) {
      console.error('Failed to create/join private room:', error);
    }
  }, [connectionStatus.userId, settingsContext, clientContext?.client]);

  return { createOrJoinPrivateChat };
};