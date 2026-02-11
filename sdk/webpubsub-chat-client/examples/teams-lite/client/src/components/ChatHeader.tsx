import React, { useContext, useState, useEffect } from "react";
import { useChatClient } from '../hooks/useChatClient';
import { ChatRoomContext } from "../contexts/ChatRoomContext";
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { usePrivateChat } from '../hooks/usePrivateChat';
import { AvatarWithOnlineStatus } from './AvatarWithOnlineStatus';
import { UserProfileCard } from './UserProfileCard';
import { AddToRoomDialog } from './AddToRoomDialog';

export const ChatHeader: React.FC = () => {
  const { connectionStatus } = useChatClient();
  const settingsContext = useContext(ChatSettingsContext);
  const clientContext = useContext(ChatClientContext);
  const [roomMembersInfo, setRoomMembersInfo] = useState<{ count: number; members: string[] } | null>(null);
  const [showMembersList, setShowMembersList] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [isAddToRoomDialogOpen, setIsAddToRoomDialogOpen] = useState(false);
  const [isAddingUsers, setIsAddingUsers] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const { createOrJoinPrivateChat } = usePrivateChat();
  const chatRoom = useContext(ChatRoomContext);
  const roomId = chatRoom?.room ? chatRoom.room.id : undefined;
  const roomName = chatRoom?.room ? chatRoom.room.name : undefined;
  const roomMembersUpdateTrigger = clientContext?.roomMembersUpdateTrigger || 0;

  // Fetch member info for current room
  useEffect(() => {
    const fetchRoomMembers = async () => {
      if (!clientContext?.client || !roomId) {
        setRoomMembersInfo(null);
        return;
      }
      
      try {
        console.log("trying to fetch room members for room:", roomId);
        const roomInfo = await clientContext.client.getRoom(roomId, true);
        console.log("fetched room member info:", roomInfo);
        const members = (roomInfo as any).members || [];
        setRoomMembersInfo({
          count: members.length,
          members: members
        });
      } catch (error) {
        console.log(`Failed to get member info for room ${roomId}:`, error);
        setRoomMembersInfo({ count: 0, members: [] });
      }
    };

    fetchRoomMembers();
  }, [clientContext?.client, roomId, roomMembersUpdateTrigger]);

  // Close members list when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showMembersList && !target.closest('[data-members-dropdown]')) {
        setShowMembersList(false);
      }
      if (showMoreMenu && !target.closest('[data-more-menu]')) {
        setShowMoreMenu(false);
      }
      if (showRoomInfo && !target.closest('[data-room-info]')) {
        setShowRoomInfo(false);
      }
    };

    if (showMembersList || showMoreMenu || showRoomInfo) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMembersList, showMoreMenu, showRoomInfo]);

  const copyRoomId = async () => {
    if (roomId) {
      try {
        await navigator.clipboard.writeText(roomId);
        console.log('Room ID copied to clipboard:', roomId);
        // You could add a toast notification here
      } catch (err) {
        console.error('Failed to copy room ID:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    }
  };

  const handleLogout = async () => {
    // Disconnect the chat client
    if (clientContext?.client) {
      try {
        await clientContext.client.stop();
      } catch (error) {
        console.error('Error disconnecting client:', error);
      }
    }
    // Refresh the page to reset all state
    window.location.reload();
  };

  const handleAddToRoom = async (userIds: string[]) => {
    if (!roomId || !clientContext?.client) return;
    
    setIsAddingUsers(true);
    setErrorMessage("");
    try {
      // Add users to room using the client
      for (const userId of userIds) {
        await (clientContext.client as any).addUserToRoom(roomId, userId);
      }
      setIsAddToRoomDialogOpen(false);
      // Refresh room members info
      const roomInfo = await clientContext.client.getRoom(roomId, true);
      const members = (roomInfo as any).members || [];
      setRoomMembersInfo({
        count: members.length,
        members: members
      });
    } catch (error) {
      console.error('Error adding users to room:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to add users to room';
      setErrorMessage(errorMsg);
    } finally {
      setIsAddingUsers(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    console.log("Removing user from room:", userId, roomId);
    if (!roomId || !clientContext?.client) return;
    
    setRemovingUserId(userId);
    setErrorMessage("");
    try {
      // Remove user from room using the client
      await (clientContext.client as any).removeUserFromRoom(roomId, userId);
      
      // Refresh room members info
      const roomInfo = await clientContext.client.getRoom(roomId, true);
      const members = (roomInfo as any).members || [];
      setRoomMembersInfo({
        count: members.length,
        members: members
      });
      
      // Show success notification with room name
      clientContext.setSuccessNotification(`Removed user ${userId} from room: ${roomName || roomId}`);
    } catch (error) {
      console.error('Error removing user from room:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to remove user from room';
      setErrorMessage(errorMsg);
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleLeaveRoom = async () => {
    if (!clientContext?.client || !roomId || !settingsContext) return;
    
    const leavingRoomName = roomName || roomId;
    setIsLeavingRoom(true);
    setErrorMessage("");
    try {
      await settingsContext.removeRoom(clientContext.client, roomId);
      setShowMembersList(false);
      
      // Show success notification
      clientContext.setSuccessNotification(`You have left the room: ${leavingRoomName}`);
    } catch (error) {
      console.error('Error leaving room:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to leave room';
      setErrorMessage(errorMsg);
    } finally {
      setIsLeavingRoom(false);
    }
  };

  const renderUserAvatar = () => {
    const userId = connectionStatus.userId || settingsContext?.userId;
    if (!userId) return null;

    return (
      <div className="header-user-avatar">
        <span className="header-user-name">
          {userId}
        </span>
        <AvatarWithOnlineStatus
          userOrRoomId={userId}
          size={40}
          fontSize={16}
          isUser={true} // This is current user
          isPrivateChat={true} // Show online status for current user in header
          onClick={() => setShowProfileCard(true)}
          cursor="pointer"
        />
      </div>
    );
  };

  const renderMemberAvatar = (userId: string, size: number = 32) => {
    const currentUserId = connectionStatus.userId || settingsContext?.userId;
    const isCurrentUser = userId === currentUserId;

    return (
      <AvatarWithOnlineStatus
        userOrRoomId={userId}
        size={size}
        fontSize={size * 0.4}
        isUser={isCurrentUser}
        isPrivateChat={true} // Member list always shows online status for users
      />
    );
  };

  const roomTitle = () => {
    if (roomId?.startsWith("private-")) {
      // Private chat room - extract other user from room ID
      const parts = roomId.split("-");
      if (parts.length >= 3) {
        const currentUserId = connectionStatus.userId || settingsContext?.userId;
        const otherUser = parts[1] === currentUserId ? parts[2] : parts[1];
        // Check if chatting with self
        const isSelfChat = otherUser === currentUserId;
        const displayName = isSelfChat ? `${otherUser} (You)` : otherUser;
        return (
          <>
            <div className="room-tag-container" data-room-info>
              <button 
                className={`room-type-tag private clickable ${showRoomInfo ? 'active' : ''}`}
                onClick={() => setShowRoomInfo(!showRoomInfo)}
              >
                Private Chat
              </button>
              {showRoomInfo && (
                <div className="room-info-dropdown">
                  <div className="room-info-item">
                    <span className="room-info-label">Room Name:</span>
                    <span className="room-info-value">{roomName || displayName}</span>
                  </div>
                  <div className="room-info-item">
                    <span className="room-info-label">Room ID:</span>
                    <span className="room-info-value">{roomId}</span>
                  </div>
                  <button onClick={() => { copyRoomId(); setShowRoomInfo(false); }} className="room-info-copy-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy ID
                  </button>
                </div>
              )}
            </div>
            <span className="room-title-name">{displayName}</span>
          </>
        );
      }
    }
    if (roomName) {
      return (
        <>
          <div className="room-tag-container" data-room-info>
            <button 
              className={`room-type-tag room clickable ${showRoomInfo ? 'active' : ''}`}
              onClick={() => setShowRoomInfo(!showRoomInfo)}
            >
              Room
            </button>
            {showRoomInfo && (
              <div className="room-info-dropdown">
                <div className="room-info-item">
                  <span className="room-info-label">Room Name:</span>
                  <span className="room-info-value">{roomName}</span>
                </div>
                <div className="room-info-item">
                  <span className="room-info-label">Room ID:</span>
                  <span className="room-info-value">{roomId}</span>
                </div>
                <button onClick={() => { copyRoomId(); setShowRoomInfo(false); }} className="room-info-copy-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy ID
                </button>
              </div>
            )}
          </div>
          <span className="room-title-name">{roomName}</span>
        </>
      );
    }
    return <span className="room-title-name">No Room Selected</span>;
  }

  const currentUserId = connectionStatus.userId || settingsContext?.userId;

  return (
    <>
      {/* Dialogs */}
      <AddToRoomDialog
        isOpen={isAddToRoomDialogOpen}
        onAddToRoom={handleAddToRoom}
        onClose={() => {
          setIsAddToRoomDialogOpen(false);
          setErrorMessage("");
        }}
        isLoading={isAddingUsers}
        roomName={roomName}
      />

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="error-banner">
          <span className="error-banner-icon">⚠️</span>
          <span className="error-banner-text">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage("")}
            className="error-banner-close"
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}

      {/* Combined header bar - Room info on left, User avatar on right */}
      <header className="room-header">
        <div className="header-left">
          <div className="header-title" aria-live="polite">
            <div className="header-actions-row">
              {/* if the room name contains '<->, then its a private chat, otherwise its a room */}
              {/* if its a private chat, extract the other user name */}
              <h1> { roomTitle() } </h1>
              {roomMembersInfo && !roomId?.startsWith('private-') && (
                <div className="members-dropdown-container" data-members-dropdown>
                  <button 
                    onClick={() => setShowMembersList(!showMembersList)}
                    className={`members-btn ${showMembersList ? 'active' : ''}`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    <span>{roomMembersInfo.count}</span>
                  </button>
                  
                  {showMembersList && (
                    <div className="members-dropdown">
                      <div className="members-dropdown-content">
                        <div className="members-dropdown-header">
                          Members ({roomMembersInfo.count})
                        </div>
                        <div className="members-list-scrollable">
                          {roomMembersInfo.members.map((member) => {
                            const currentUserId = connectionStatus.userId || settingsContext?.userId;
                            const isCurrentUser = member === currentUserId;
                            const isRemoving = removingUserId === member;
                            
                            return (
                              <div
                                key={member}
                                className={`member-item ${isCurrentUser ? 'current-user' : ''}`}
                              >
                                <div
                                  onClick={async () => {
                                    if (!isCurrentUser) {
                                      await createOrJoinPrivateChat(member);
                                      setShowMembersList(false);
                                    }
                                  }}
                                  className="member-item-content"
                                >
                                  {renderMemberAvatar(member, 24)}
                                  <span>{member} {isCurrentUser && '(You)'}</span>
                                </div>
                                {!isCurrentUser && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveUser(member);
                                    }}
                                    className="member-remove-btn"
                                    disabled={isRemoving}
                                    title="Remove user from room"
                                  >
                                    {isRemoving ? (
                                      <svg
                                        className="spinner"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                      >
                                        <circle cx="12" cy="12" r="10" strokeWidth="3" strokeLinecap="round" />
                                      </svg>
                                    ) : (
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M18 6L6 18M6 6l12 12" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Room Management Actions */}
                        <div className="members-dropdown-divider" />
                        <div className="members-dropdown-actions">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsAddToRoomDialogOpen(true);
                              setShowMembersList(false);
                            }}
                            className="member-action-btn"
                            title="Add users to this room"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                            Add people
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLeaveRoom();
                            }}
                            className="member-action-btn leave-room-btn"
                            title="Leave this room"
                            disabled={isLeavingRoom}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                              <polyline points="16 17 21 12 16 7" />
                              <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            {isLeavingRoom ? 'Leaving...' : 'Leave Room'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>
          </div>
        </div>

        {/* User avatar on the right */}
        {currentUserId && (
          <div className="profile-card-wrapper header-right-avatar">
            {renderUserAvatar()}
            {showProfileCard && (
              <>
                <div className="profile-card-backdrop" onClick={() => setShowProfileCard(false)} />
                <UserProfileCard
                  userId={currentUserId}
                  onClose={() => setShowProfileCard(false)}
                  onLogout={handleLogout}
                />
              </>
            )}
          </div>
        )}
    </header>
    </>
  );
};
