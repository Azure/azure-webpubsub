import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ChatSettingsProvider } from '../providers/ChatSettingsProvider';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

function useSettings(){
  const ctx = React.useContext(ChatSettingsContext);
  if(!ctx) throw new Error('Missing context');
  return ctx;
}

describe('updateRoom whitespace semantics', () => {
  it('ignores whitespace-only name change and preserves original', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if(url === '/api/rooms' && (!init || init.method === 'GET' || !init?.method)) {
        return new Response(JSON.stringify({ rooms: [ { roomId: 'public', roomName: 'Public Chat', userId: 'system', description: 'Default public room' } ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ roomId: 'room_Y', roomName: body.roomName, userId: 'You' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms/room_Y' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        // Simulate server ignoring whitespace name and returning original name
        return new Response(JSON.stringify({ roomId: 'room_Y', roomName: 'Original', userId: 'You', description: body.description }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const wrapper: React.FC<{children: React.ReactNode}> = ({ children }) => <ChatSettingsProvider>{children}</ChatSettingsProvider>;
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => { await result.current.addRoom('Original'); });
    await act(async () => { await result.current.updateRoom('room_Y', '   ', 'New Desc'); });
    const room = result.current.rooms.find(r => r.roomId === 'room_Y');
    expect(room?.roomName).toBe('Original');
  });
});
