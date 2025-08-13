import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ChatSettingsProvider } from '../providers/ChatSettingsProvider';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

function useSettings(){
  const ctx = React.useContext(ChatSettingsContext);
  if(!ctx) throw new Error('Missing context');
  return ctx;
}

describe('updateRoom & removeRoom', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates then removes a room (happy path)', async () => {
    // fetch sequence:
    // 1. initial GET /api/rooms -> empty list plus default
    // 2. POST create
    // 3. PUT update
    // 4. DELETE remove
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if(url === '/api/rooms' && (!init || init.method === 'GET' || !init.method)) {
        return new Response(JSON.stringify({ rooms: [ { roomId: 'public', roomName: 'Public Chat', userId: 'system', description: 'Default public room' } ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        expect(body).not.toHaveProperty('roomId');
        return new Response(JSON.stringify({ roomId: 'room_123', roomName: body.roomName, userId: 'u' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms/room_123' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        expect(body.roomName).toBe('Renamed');
        return new Response(JSON.stringify({ roomId: 'room_123', roomName: body.roomName, userId: 'u', description: body.description }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms/room_123' && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ message: 'Room deleted (idempotent)' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const wrapper: React.FC<{children: React.ReactNode}> = ({ children }) => <ChatSettingsProvider>{children}</ChatSettingsProvider>;
    const { result } = renderHook(() => useSettings(), { wrapper });

    // create
    await act(async () => { await result.current.addRoom('Temp'); });
    expect(result.current.rooms.some(r => r.roomId === 'room_123')).toBe(true);

    // update
    await act(async () => { await result.current.updateRoom('room_123', 'Renamed', 'Desc'); });
    const updated = result.current.rooms.find(r => r.roomId === 'room_123');
    expect(updated?.roomName).toBe('Renamed');
    expect(updated?.description).toBe('Desc');

    // remove
    await act(async () => { await result.current.removeRoom('room_123'); });
    expect(result.current.rooms.some(r => r.roomId === 'room_123')).toBe(false);

    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('handles addRoom error path', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if(url === '/api/rooms' && (!init || init.method === 'GET' || !init.method)) {
        return new Response(JSON.stringify({ rooms: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if(url === '/api/rooms' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'roomName is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const wrapper: React.FC<{children: React.ReactNode}> = ({ children }) => <ChatSettingsProvider>{children}</ChatSettingsProvider>;
    const { result } = renderHook(() => useSettings(), { wrapper });

    await expect(async () => {
      await act(async () => { await result.current.addRoom('   '); });
    }).rejects.toThrow(/roomName is required|Failed to create room/);

    // ensure no room added
    expect(result.current.rooms.length).toBe(0);

    (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });
});
