import React, { useContext, useState, useMemo, useEffect } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import type { RoomMetadata } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { CreateRoomDialog } from './CreateRoomDialog';
import { useChatClient } from '../hooks/useChatClient';
import { usePrivateChat } from '../hooks/usePrivateChat';
import { AvatarWithOnlineStatus } from './AvatarWithOnlineStatus';
import { GLOBAL_METADATA_ROOM_ID } from '../lib/constants';

export const Sidebar: React.FC = () => {
  const settings = useContext(ChatSettingsContext);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);
  const [allMembers, setAllMembers] = useState<Map<string, Set<string>>>(new Map());
  const [membersFetchTrigger, setMembersFetchTrigger] = useState(0);
  const clientContext = useContext(ChatClientContext);
  const { connectionStatus } = useChatClient();
  const { createOrJoinPrivateChat } = usePrivateChat();
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
    // Strip HTML tags to get plain text safely using DOM parser
    const rawContent = lastMessage.content;
    const doc = new DOMParser().parseFromString(rawContent, 'text/html');
    const content = (doc.body.textContent || '').trim();
    const maxLength = 20; // Adjust based on your UI needs
    const isPrivateChat = roomId.startsWith('private-');
    
    // For private chats, don't show sender prefix
    if (isPrivateChat) {
      if (content.length > maxLength) {
        return `${content.substring(0, maxLength)}...`;
      }
      return content || 'No messages yet';
    }
    
    // For group chats, show sender prefix
    if (content.length > maxLength) {
      return `${sender}: ${content.substring(0, maxLength)}...`;
    }
    return content ? `${sender}: ${content}` : 'No messages yet';
  }, [getLastMessageForRoom]);

  // Helper function to format timestamp for display
  const formatMessageTime = React.useCallback((roomId: string): string => {
    if (!roomId || !getLastMessageForRoom) return '';
    
    const lastMessage = getLastMessageForRoom(roomId);
    if (!lastMessage) return '';
    
    // Handle case where timestamp might be missing or invalid
    if (!lastMessage.timestamp) {
      console.warn(`Missing timestamp for room ${roomId}:`, lastMessage);
      return '';
    }
    
    const msgDate = new Date(lastMessage.timestamp);
    
    // Check if date is valid
    if (isNaN(msgDate.getTime())) {
      console.warn(`Invalid timestamp for room ${roomId}:`, lastMessage.timestamp);
      return '';
    }
    
    const now = new Date();
    const isToday = msgDate.toDateString() === now.toDateString();
    
    if (isToday) {
      // Show time only for today's messages (e.g., "12:17 PM")
      return msgDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (msgDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // Check if within this week (last 7 days)
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (msgDate > weekAgo) {
      return msgDate.toLocaleDateString([], { weekday: 'short' });
    }
    
    // Older messages show date
    return msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, [getLastMessageForRoom]);

  const statusClass = useMemo(() => {
    switch (connectionStatus.status) {
      case "connected": return "header-status connected";
      case "connecting": return "header-status connecting";
      case "error": return "header-status error";
      default: return "header-status disconnected";
    }
  }, [connectionStatus.status]);

  // Fetch members for all rooms for search
  useEffect(() => {
    const fetchAllMembers = async () => {
      if (!clientContext?.client || !settings?.rooms) return;
      
      const membersMap = new Map<string, Set<string>>();
      
      for (const room of settings.rooms) {
        if (room.roomId.startsWith('private-')) continue;
        
        try {
          const roomInfo = await clientContext.client.getRoom(room.roomId, true);
          const members = (roomInfo as any).members || [];
          membersMap.set(room.roomId, new Set(members));
        } catch (error) {
          console.error(`Failed to fetch members for room ${room.roomId}:`, error);
        }
      }
      
      setAllMembers(membersMap);
    };

    if (settings?.rooms && settings.rooms.length > 0) {
      fetchAllMembers();
    }
  }, [clientContext?.client, settings?.rooms, membersFetchTrigger]);

  // Filter rooms based on search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { rooms: [], members: [] };
    
    const query = searchQuery.toLowerCase();
    
    const results: { 
      rooms: RoomMetadata[]; 
      members: { userId: string; roomId: string; roomName: string }[] 
    } = {
      rooms: [],
      members: []
    };

    // Search rooms (exclude private chats) - only match room name
    if (settings?.rooms) {
      results.rooms = settings.rooms.filter(room => {
        if (room.roomId.startsWith('private-')) return false;
        return room.roomName?.toLowerCase().includes(query);
      }).slice(0, 5);
    }

    // Search members from cached data
    const memberSet = new Set<string>();
    allMembers.forEach((members, roomId) => {
      const room = settings?.rooms?.find(r => r.roomId === roomId);
      if (!room) return;
      
      members.forEach(userId => {
        if (userId.toLowerCase().includes(query) && !memberSet.has(userId)) {
          memberSet.add(userId);
          results.members.push({ userId, roomId, roomName: room.roomName });
        }
      });
    });

    // Also search users from private chats
    // Private room format: private-{sortedUserIds}
    if (settings?.rooms) {
      const currentUserId = settings.userId;
      settings.rooms.forEach(room => {
        if (!room.roomId.startsWith('private-')) return;
        
        // Extract user IDs from private room ID
        const userIdsPart = room.roomId.replace('private-', '');
        const userIds = userIdsPart.split('-');
        
        // Find the other user (not current user)
        const otherUserId = userIds.find(id => id !== currentUserId);
        if (otherUserId && otherUserId.toLowerCase().includes(query) && !memberSet.has(otherUserId)) {
          memberSet.add(otherUserId);
          // For private chats, clicking on the user should open the private chat
          results.members.push({ userId: otherUserId, roomId: room.roomId, roomName: `Chat with ${otherUserId}` });
        }
      });
    }

    results.members = results.members.slice(0, 5);

    return results;
  }, [searchQuery, settings?.rooms, allMembers, settings?.userId]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showSearchResults && !target.closest('[data-sidebar-search]')) {
        setShowSearchResults(false);
      }
      if (showConnectionInfo && !target.closest('[data-connection-status]')) {
        setShowConnectionInfo(false);
      }
    };

    if (showSearchResults || showConnectionInfo) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSearchResults, showConnectionInfo]);

  const handleSearchSelect = (selectedRoomId: string) => {
    if (settings?.setRoomId) {
      settings.setRoomId(selectedRoomId);
    }
    setSearchQuery("");
    setShowSearchResults(false);
  };

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
      // Use includeSystemMessages=true for sorting so new rooms with only system messages appear at top
      const aLastMsg = getLastMessageForRoom?.(a.roomId, true);
      const bLastMsg = getLastMessageForRoom?.(b.roomId, true);
      
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
  const { roomId, setRoomId, addRoom } = settings;

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
          {/* Search icon button */}
          <button
            className={`sidebar-icon-btn ${showSearchBox ? 'active' : ''}`}
            onClick={() => setShowSearchBox(!showSearchBox)}
            title="Search rooms"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        </div>

        {/* Expandable Search Box */}
        {showSearchBox && (
          <div className="sidebar-search-container" data-sidebar-search>
            <div className="sidebar-search-box">
              <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="sidebar-search-input"
                placeholder="Search rooms and people..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => {
                  setShowSearchResults(true);
                  setMembersFetchTrigger(prev => prev + 1);
                }}
                autoFocus
              />
              {searchQuery && (
                <button 
                  className="search-clear"
                  onClick={() => { setSearchQuery(""); setShowSearchResults(false); }}
                >
                  ×
                </button>
              )}
            </div>
            {showSearchResults && searchQuery.trim() && (
              <div className="search-results">
                {searchResults.rooms.length === 0 && searchResults.members.length === 0 ? (
                  <div className="search-no-results">No rooms or people found</div>
                ) : (
                  <>
                    {searchResults.rooms.length > 0 && (
                      <>
                        <div className="search-result-section-header">Rooms</div>
                        {searchResults.rooms.map(room => (
                          <button
                            key={room.roomId}
                            className={`search-result-item ${room.roomId === settings?.roomId ? 'active' : ''}`}
                            onClick={() => handleSearchSelect(room.roomId)}
                          >
                            <div className="search-result-avatar-wrapper">
                              <AvatarWithOnlineStatus
                                userOrRoomId={getAvatarIdentifier(room)}
                                size={28}
                                fontSize={12}
                                isUser={false}
                                isPrivateChat={false}
                              />
                              <span className="search-result-name">{room.roomName || room.roomId}</span>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                    {searchResults.members.length > 0 && (
                      <>
                        <div className="search-result-section-header">People</div>
                        {searchResults.members.map((member, index) => (
                          <button
                            key={`${member.userId}-${index}`}
                            className="search-result-item"
                            onClick={async () => {
                              await createOrJoinPrivateChat(member.userId);
                              setSearchQuery("");
                              setShowSearchResults(false);
                            }}
                          >
                            <div className="search-result-avatar-wrapper">
                              <AvatarWithOnlineStatus
                                userOrRoomId={member.userId}
                                size={28}
                                fontSize={12}
                                isUser={false}
                                isPrivateChat={true}
                              />
                              <span className="search-result-name">{member.userId}</span>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Create Room Button */}
        <div className="sidebar-actions-container">
          <button
            type="button"
            className="sidebar-action-btn"
            onClick={() => setIsCreateDialogOpen(true)}
            aria-label="Create room"
            title="Create room"
          >
            <span className="sidebar-action-btn-icon">+</span>
            Create Room
          </button>
        </div>

      <ul className="room-list">
        {sortedRooms.map(room => {
          const unreadCount = unreadCounts[room.roomId] || 0;
          const isActive = room.roomId === roomId;
          const messagePreview = formatMessagePreview(room.roomId);
          const messageTime = formatMessageTime(room.roomId);
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
                <div className="room-meta">
                  {messageTime && (
                    <span className={`room-time ${unreadCount > 0 ? 'unread' : ''}`}>
                      {messageTime}
                    </span>
                  )}
                  {!isActive && unreadCount > 0 && (
                    <div 
                      className="unread-badge"
                      title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
                    >
                      {unreadCount}
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      
      {/* Connection status at bottom */}
      <div className="sidebar-footer" data-connection-status>
        <button 
          className={`connection-status-dot ${statusClass.replace('header-status ', '')}`}
          onClick={() => setShowConnectionInfo(!showConnectionInfo)}
          title="Connection status"
        >
          <span className="status-icon" aria-hidden>●</span>
        </button>
        {showConnectionInfo && (
          <div className="connection-info-dropdown">
            <div className="connection-info-header">
              <span className={`status-icon ${connectionStatus.status}`} aria-hidden>●</span>
              <span className={`connection-status-text ${connectionStatus.status}`}>{connectionStatus.status}</span>
            </div>
            {connectionStatus.userId && (
              <div className="connection-info-item">
                <span className="connection-info-label">User ID:</span>
                <span className="connection-info-value">{connectionStatus.userId}</span>
              </div>
            )}
            {connectionStatus.connectionId && (
              <div className="connection-info-item">
                <span className="connection-info-label">Connection ID:</span>
                <span className="connection-info-value">{connectionStatus.connectionId}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
    </>  );
};