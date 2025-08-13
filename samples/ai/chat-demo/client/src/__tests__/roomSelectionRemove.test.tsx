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

describe('Room removal selection fallback', () => {
  it('reverts to public when active room removed', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if(url === '/api/rooms' && (!init || init.method === 'GET' || !init?.method)) {
        return new Response(JSON.stringify({ rooms: [ { roomId: 'public', roomName: 'Public Chat', userId: 'system', description: 'Default public room' } ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ roomId: 'room_X', roomName: body.roomName, userId: 'You' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms/room_X' && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ message: 'Room deleted (idempotent)' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const wrapper: React.FC<{children: React.ReactNode}> = ({ children }) => <ChatSettingsProvider>{children}</ChatSettingsProvider>;
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => { await result.current.addRoom('ToRemove'); });
    expect(result.current.roomId).toBe('room_X');
    await act(async () => { await result.current.removeRoom('room_X'); });
    expect(result.current.roomId).toBe('public');
  });
});
