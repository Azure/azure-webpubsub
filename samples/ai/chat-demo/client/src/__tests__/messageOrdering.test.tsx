import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { ChatMessages } from '../components/ChatMessages';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

// Minimal helper to render messages list
const renderWithMessages = (msgs: Array<{ id: string; content: string; timestamp: string }>) => {
  const settingsValue = {
    roomId: 'public',
    rooms: [{ roomId: 'public', roomName: 'Public Chat', userId: 'system', description: '' }],
    setRoomId: () => {},
    setRooms: () => {},
    userId: 'tester',
    setUserId: () => {},
  } as any; // minimal subset for component
  render(
    <ChatSettingsContext.Provider value={settingsValue}>
      <ChatClientContext.Provider
        value={{
          client: null,
          connectionStatus: { status: 'connected', message: 'Connected' },
          messages: msgs.map(m => ({ ...m, isFromCurrentUser: false })),
          isStreaming: false,
          sendMessage: async () => {},
          clearMessages: () => {},
          uiNotice: undefined,
        }}
      >
        <ChatMessages />
      </ChatClientContext.Provider>
    </ChatSettingsContext.Provider>
  );
};

// The reducer / provider logic ensures we append messages and update in place without re-sorting.
// This test simulates M1 arriving, then M2, then an update chunk to M1 (simulated by replacing content), ensuring order preserved.

describe('message ordering stability', () => {
  it('keeps original order when earlier message updates after later one', () => {
    const baseTs = Date.now();
    const m1 = { id: 'm1', content: 'Hello', timestamp: new Date(baseTs).toISOString() };
    const m2 = { id: 'm2', content: 'World', timestamp: new Date(baseTs + 1).toISOString() };
    renderWithMessages([m1, m2]);
    // Simulate streaming update to m1 by re-rendering with updated content but same order array
    renderWithMessages([{ ...m1, content: 'Hello (updated)' }, m2]);
  const container = screen.getAllByRole('generic').find(el => el.classList.contains('messages')) as HTMLElement;
  // Fallback: query by data-message-id attributes
  const m1Node = container.querySelector('[data-message-id="m1"]') as HTMLElement;
  const m2Node = container.querySelector('[data-message-id="m2"]') as HTMLElement;
  expect(m1Node).toBeTruthy();
  expect(m2Node).toBeTruthy();
  const siblings = Array.from(container.children);
  const m1Index = siblings.indexOf(m1Node);
  const m2Index = siblings.indexOf(m2Node);
  expect(m1Index).toBeGreaterThan(-1);
  expect(m2Index).toBeGreaterThan(-1);
  expect(m1Index).toBeLessThan(m2Index);
  // Order assertion complete via indices above
  });
});
