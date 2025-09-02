import React, { useContext, useState, useMemo } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

export const Sidebar: React.FC = () => {
  const settings = useContext(ChatSettingsContext);
  const [newRoom, setNewRoom] = useState('');

  const canAdd = useMemo(() => newRoom.trim().length > 0, [newRoom]);
  if (!settings) return null;
  const { roomId, rooms, setRoomId, addRoom, removeRoom } = settings;

  const handleAdd = () => {
    if (!canAdd) return;
    const id = addRoom(newRoom.trim());
    setNewRoom('');
    setRoomId(id);
  };

  return (
    <aside className="sidebar" aria-label="Rooms">
      <div className="sidebar-header">
        <h2>Rooms</h2>
        <div className="sidebar-actions">
          <input
            type="text"
            placeholder="Add room id"
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="sidebar-input"
          />
          <button
            type="button"
            className="sidebar-add"
            onClick={handleAdd}
            disabled={!canAdd}
            aria-label="Add room"
            title="Add room"
          >＋</button>
        </div>
      </div>
      <ul className="room-list">
        {rooms.map(r => (
          <li key={r} className={r === roomId ? 'room-item active' : 'room-item'}>
            <button className="room-button" onClick={() => setRoomId(r)} title={r}>
              <span className="room-dot" aria-hidden>●</span>
              <span className="room-label">{r}</span>
            </button>
            {r !== 'public' && (
              <button className="room-remove" onClick={() => removeRoom(r)} aria-label={`Remove ${r}`}>✕</button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};
