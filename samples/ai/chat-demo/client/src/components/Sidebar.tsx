import React, { useContext, useState, useMemo } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

export const Sidebar: React.FC = () => {
  const settings = useContext(ChatSettingsContext);
  const [newRoomName, setNewRoomName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const canAdd = useMemo(() => newRoomName.trim().length > 0, [newRoomName]);
  if (!settings) return null;
  const { roomId, rooms, setRoomId, addRoom, removeRoom } = settings;

  const handleAdd = async () => {
    if (!canAdd || isAdding) return;
    setIsAdding(true);
    try {
      const id = await addRoom(newRoomName.trim());
      setNewRoomName('');
      setRoomId(id);
    } catch (error) {
      console.error('Failed to add room:', error);
      // Could show a toast notification here
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <aside className="sidebar" aria-label="Rooms">
      <div className="sidebar-header">
        <h2>Rooms</h2>
        <div className="sidebar-actions">
          <input
            type="text"
            placeholder="Room name"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="sidebar-input"
            disabled={isAdding}
          />
          <button
            type="button"
            className="sidebar-add"
            onClick={handleAdd}
            disabled={!canAdd || isAdding}
            aria-label="Add room"
            title="Add room"
          >{isAdding ? '...' : '＋'}</button>
        </div>
      </div>
      <ul className="room-list">
        {rooms.map(room => {
          console.log('Rendering room:', room); // Debug log
          return (
            <li key={room.roomId} className={room.roomId === roomId ? 'room-item active' : 'room-item'}>
              <button className="room-button" onClick={() => setRoomId(room.roomId)} title={room.roomName}>
                <span className="room-dot" aria-hidden>●</span>
                <div className="room-info">
                  <span className="room-label">{room.roomName}</span>
                  <span className="room-id" style={{ fontSize: '0.75em', opacity: 0.6 }}>{room.roomId}</span>
                </div>
              </button>
              {room.roomId !== 'public' && (
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
  );
};
