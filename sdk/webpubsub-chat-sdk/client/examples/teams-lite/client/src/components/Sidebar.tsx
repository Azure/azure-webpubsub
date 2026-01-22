import React, { useContext, useState, useMemo } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import type { RoomMetadata } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { CreateRoomDialog } from './CreateRoomDialog';
import { useChatClient } from '../hooks/useChatClient';
import { AvatarWithOnlineStatus } from './AvatarWithOnlineStatus';
import { GLOBAL_METADATA_ROOM_ID } from '../lib/constants';

export const Sidebar: React.FC = () => {
  const settings = useContext(ChatSettingsContext);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const clientContext = useContext(ChatClientContext);
  const { connectionStatus } = useChatClient();
  const unreadCounts = clientContext?.unreadCounts || {};
  const getLastMessageForRoom = clientContext?.getLastMessageForRoom;
  const roomMessagesUpdateTrigger = clientContext?.roomMessagesUpdateTrigger || 0;

  // Get current user ID
  const currentUserId = connectionStatus.userId || settings?.userId;

  // Helper function to get the identifier for avatar display
  const getAvatarIdentifier = React.useCallback((room: RoomMetadata): string => {
    // Check if it's a private chat (starts with "private-")
    if (room.roomId && room.roomId.startsWith('private-')) {
      // Extract user IDs from room ID: private-user1-user2
      const parts = room.roomId.split('-');
      if (parts.length >= 3 && currentUserId) {
        // Return the other user's ID (not current user)
        const user1 = parts[1];
        const user2 = parts[2];
        return user1 === currentUserId ? user2 : user1;
      }
    }
    
    // For regular rooms, use room name for avatar
    return room.roomName || room.roomId || 'Unknown';
  }, [currentUserId]);

  // Helper function to get display name for room
  const getRoomDisplayName = React.useCallback((room: RoomMetadata): string => {
    // Check if it's a private chat (contains "<->")
    if (room.roomName && room.roomName.includes('<->')) {
      // Parse the two user IDs and return the other user's ID
      const userIds = room.roomName.split(' <-> ');
      if (userIds.length === 2 && currentUserId) {
        return userIds[0] === currentUserId ? userIds[1] : userIds[0];
      }
    }
    
    // For regular rooms, return the original room name
    return room.roomName;
  }, [currentUserId]);

  // Helper function to format message preview - memoized to avoid recreation on each render
  const formatMessagePreview = React.useCallback((roomId: string): string => {
    if (!roomId) return 'No room ID';
    if (!getLastMessageForRoom) return roomId;
    
    const lastMessage = getLastMessageForRoom(roomId);
    if (!lastMessage) return 'No messages yet';
    
    const sender = lastMessage.sender || 'Unknown';
    const content = lastMessage.content;
    const maxLength = 20; // Adjust based on your UI needs
    const isPrivateChat = roomId.startsWith('private-');
    
    // For private chats, don't show sender prefix
    if (isPrivateChat) {
      if (content.length > maxLength) {
        return `${content.substring(0, maxLength)}...`;
      }
      return content;
    }
    
    // For group chats, show sender prefix
    if (content.length > maxLength) {
      return `${sender}: ${content.substring(0, maxLength)}...`;
    }
    return `${sender}: ${content}`;
  }, [getLastMessageForRoom]);

  const statusClass = useMemo(() => {
    switch (connectionStatus.status) {
      case "connected": return "header-status connected";
      case "connecting": return "header-status connecting";
      case "error": return "header-status error";
      default: return "header-status disconnected";
    }
  }, [connectionStatus.status]);

  // Sort rooms by last message timestamp - most recent activity first
  // Also filter out global metadata room and deduplicate by roomId
  const sortedRooms = React.useMemo(() => {
    if (!settings?.rooms) return [];
    
    // Filter out global metadata room and deduplicate by roomId
    const seenIds = new Set<string>();
    const filteredRooms = settings.rooms.filter(room => {
      // Skip rooms with undefined roomId
      if (!room.roomId) return false;
      // Skip global metadata room
      if (room.roomId === GLOBAL_METADATA_ROOM_ID) return false;
      // Skip duplicates
      if (seenIds.has(room.roomId)) return false;
      seenIds.add(room.roomId);
      return true;
    });
    
    return filteredRooms.sort((a, b) => {
      const aLastMsg = getLastMessageForRoom?.(a.roomId);
      const bLastMsg = getLastMessageForRoom?.(b.roomId);
      
      // Rooms without messages go to the bottom
      if (!aLastMsg && !bLastMsg) return 0;
      if (!aLastMsg) return 1;
      if (!bLastMsg) return -1;
      
      // Sort by most recent message timestamp
      return new Date(bLastMsg.timestamp).getTime() - new Date(aLastMsg.timestamp).getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.rooms, getLastMessageForRoom, roomMessagesUpdateTrigger]);

  if (!settings) return null;
  const { roomId, setRoomId, addRoom, addUserToRoom, removeRoom } = settings;

  const handleCreateRoom = async (roomName: string, memberIds: string[]) => {
    setIsCreating(true);
    try {
      const id = await addRoom(clientContext!.client!, roomName, memberIds);
      setIsCreateDialogOpen(false);
      setRoomId(id);
    } catch (error) {
      console.error('HandleCreateRoomError:', error);
      // Error will be handled by the dialog if needed
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <CreateRoomDialog
        isOpen={isCreateDialogOpen}
        onCreateRoom={handleCreateRoom}
        onClose={() => setIsCreateDialogOpen(false)}
        isLoading={isCreating}
      />
      <aside className="sidebar" aria-label="Rooms">
        <div className="sidebar-header">
          <h2 className="sidebar-title">
            <img src="/microsoft_teams.svg" alt="Microsoft Teams" className="sidebar-logo" />
            Chat
          </h2>
          <div className={`${statusClass} ml-auto`} title={connectionStatus.message}>
            <span className="status-icon" aria-hidden>●</span>
            <span className="status-text">{connectionStatus.status}</span>
          </div>
        </div>
        <div className="sidebar-actions-container">
          <button
            type="button"
            className="sidebar-action-btn"
            onClick={() => setIsCreateDialogOpen(true)}
            aria-label="Create room"
            title="Create room"
          >
            <span className="sidebar-action-btn-icon">+</span>
            Create
          </button>
        </div>
      <ul className="room-list">
        {sortedRooms.map(room => {
          const unreadCount = unreadCounts[room.roomId] || 0;
          const isActive = room.roomId === roomId;
          const messagePreview = formatMessagePreview(room.roomId);
          const avatarIdentifier = getAvatarIdentifier(room);
          const displayName = getRoomDisplayName(room);
          return (
            <li key={room.roomId} className={isActive ? 'room-item active' : 'room-item'}>
              <button className="room-button" onClick={() => setRoomId(room.roomId)} title={displayName}>
                <AvatarWithOnlineStatus 
                  userOrRoomId={avatarIdentifier}
                  size={32} 
                  fontSize={14} 
                  isUser={false}
                  isPrivateChat={room.roomId?.startsWith('private-') || false}
                />
                <div className="room-info">
                  <span 
                    className={`room-label ${unreadCount > 0 ? 'room-label-unread' : ''}`}
                  >
                    {displayName}
                  </span>
                  <span 
                    className={`room-preview ${unreadCount > 0 ? 'unread' : ''}`}
                    title={messagePreview}
                  >
                    {messagePreview}
                  </span>
                </div>
                {!isActive && unreadCount > 0 && (
                  <div 
                    className="unread-badge"
                    title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
                  >
                    {unreadCount}
                  </div>
                )}
              </button>
              {room.roomId && room.roomId !== 'public' && (
                <button 
                  className="room-remove" 
                  onClick={async () => {
                    try {
                      await removeRoom(room.roomId);
                    } catch (error) {
                      console.error('Failed to remove room:', error);
                      // Could show a toast notification here
                    }
                  }} 
                  aria-label={`Remove ${room.roomName}`}
                  title={`Remove ${room.roomName}`}
                >✕</button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
    </>  );
};