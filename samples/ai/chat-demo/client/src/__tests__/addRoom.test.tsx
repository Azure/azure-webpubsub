import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { ChatSettingsProvider } from '../providers/ChatSettingsProvider';

// Helper to capture provider value
function useSettings() {
  const ctx = React.useContext(ChatSettingsContext);
  if (!ctx) throw new Error('Missing context');
  return ctx;
}

describe('addRoom', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates room with auto-generated id and no custom id in request body', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.endsWith('/api/rooms')) {
        // Inspect body
        const body = init?.body ? JSON.parse(init.body as string) : {};
        expect(body).not.toHaveProperty('roomId');
        expect(typeof body.roomName).toBe('string');
        return new Response(JSON.stringify({
          roomId: 'room_abcd1234',
          roomName: body.roomName,
          userId: 'test-user'
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    const wrapper: React.FC<{children: React.ReactNode}> = ({ children }) => <ChatSettingsProvider>{children}</ChatSettingsProvider>;
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      const newId = await result.current.addRoom('My Test Room');
      expect(newId).toBe('room_abcd1234');
    });

    // Ensure provider state updated
    expect(result.current.rooms.some(r => r.roomId === 'room_abcd1234')).toBe(true);

  (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });
});
