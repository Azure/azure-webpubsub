import React, { useState, useContext, useEffect, useMemo } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { usePrivateChat } from '../hooks/usePrivateChat';

export const TopSearchBar: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const settingsContext = useContext(ChatSettingsContext);
  const clientContext = useContext(ChatClientContext);
  const { createOrJoinPrivateChat } = usePrivateChat();

  const rooms = settingsContext?.rooms || [];
  const setRoomId = settingsContext?.setRoomId;

  // Get all members from all non-private rooms
  const [allMembers, setAllMembers] = useState<Map<string, Set<string>>>(new Map());

  // Fetch members for all rooms
  useEffect(() => {
    const fetchAllMembers = async () => {
      if (!clientContext?.client) return;
      
      const membersMap = new Map<string, Set<string>>();
      
      for (const room of rooms) {
        // Skip private chat rooms
        if (room.roomId.startsWith('private-')) continue;
        
        try {
          const roomInfo = await clientContext.client.getRoomDetail(room.roomId, { withMembers: true });
          const members = (roomInfo as any).members || [];
          membersMap.set(room.roomId, new Set(members));
        } catch (error) {
          console.error(`Failed to fetch members for room ${room.roomId}:`, error);
        }
      }
      
      setAllMembers(membersMap);
    };

    if (rooms.length > 0) {
      fetchAllMembers();
    }
  }, [clientContext?.client, rooms]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { rooms: [], members: [] };

    const query = searchQuery.toLowerCase();
    const results: { rooms: typeof rooms; members: { userId: string; roomId: string; roomName: string }[] } = {
      rooms: [],
      members: []
    };

    // Search rooms (exclude private chats)
    results.rooms = rooms.filter(room => {
      // Filter out private chat rooms
      if (room.roomId.startsWith('private-')) return false;
      
      return room.roomName.toLowerCase().includes(query) ||
             room.roomId.toLowerCase().includes(query);
    });

    // Search members
    const memberSet = new Set<string>();
    allMembers.forEach((members, roomId) => {
      const room = rooms.find(r => r.roomId === roomId);
      if (!room) return;
      
      members.forEach(userId => {
        if (userId.toLowerCase().includes(query) && !memberSet.has(userId)) {
          memberSet.add(userId);
          results.members.push({
            userId,
            roomId,
            roomName: room.roomName
          });
        }
      });
    });

    return results;
  }, [searchQuery, rooms, allMembers]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.search-box-container')) {
        setShowResults(false);
      }
    };

    if (showResults) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showResults]);

  const handleRoomClick = (roomId: string) => {
    if (setRoomId) {
      setRoomId(roomId);
    }
    setSearchQuery('');
    setShowResults(false);
  };

  const handleMemberClick = async (userId: string) => {
    await createOrJoinPrivateChat(userId);
    setSearchQuery('');
    setShowResults(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowResults(true);
  };

  const handleClear = () => {
    setSearchQuery('');
    setShowResults(false);
  };

  const totalResults = searchResults.rooms.length + searchResults.members.length;
  const hasResults = searchQuery.trim() && totalResults > 0;
  const hasNoResults = searchQuery.trim() && totalResults === 0;

  return (
    <div className="top-user-bar">
      <div className="top-bar-left">
        <svg className="top-bar-logo" viewBox="0 0 24 24" fill="#6264a7">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <span className="top-bar-title">Teams Lite</span>
      </div>
      
      <div className="search-box-container">
        <div className="search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search rooms and people..."
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => setShowResults(true)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={handleClear}>
              ×
            </button>
          )}
        </div>
        
        {showResults && (hasResults || hasNoResults) && (
          <div className="search-results">
            {hasNoResults && (
              <div className="search-no-results">
                No rooms or people found
              </div>
            )}
            
            {searchResults.rooms.length > 0 && (
              <>
                <div className="search-result-section-header">Rooms</div>
                {searchResults.rooms.map(room => (
                  <button
                    key={room.roomId}
                    className="search-result-item"
                    onClick={() => handleRoomClick(room.roomId)}
                  >
                    <span className="search-result-name">{room.roomName}</span>
                    <span className="search-result-tag">Room</span>
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
                    onClick={() => handleMemberClick(member.userId)}
                  >
                    <span className="search-result-name">{member.userId}</span>
                    <span className="search-result-tag">in {member.roomName}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="top-bar-right">
        {/* Placeholder for future actions */}
      </div>
    </div>
  );
};
