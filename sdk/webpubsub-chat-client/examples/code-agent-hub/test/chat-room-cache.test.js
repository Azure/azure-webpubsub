import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evictRoomFromClientCache } from '../web-portal/public/js/chat-room-cache.js';

describe('chat room cache helpers', () => {
  it('removes deleted rooms from map-backed chat client state', () => {
    const client = {
      _rooms: new Map([
        ['session-1', { roomId: 'session-1', title: 'Deleted Session' }],
        ['session-2', { roomId: 'session-2', title: 'Other Session' }],
      ]),
      _joinedRoomIds: new Set(['session-1', 'session-2']),
      get rooms() {
        return Array.from(this._rooms.values());
      },
    };

    assert.equal(evictRoomFromClientCache(client, 'session-1'), true);
    assert.deepEqual(client.rooms.map((room) => room.roomId), ['session-2']);
    assert.equal(client._joinedRoomIds.has('session-1'), false);
  });

  it('falls back to mutating array-backed room collections used by simple test doubles', () => {
    const client = {
      rooms: [
        { roomId: 'session-1', title: 'Deleted Session' },
        { roomId: 'session-2', title: 'Other Session' },
      ],
    };

    assert.equal(evictRoomFromClientCache(client, 'session-1'), true);
    assert.deepEqual(client.rooms.map((room) => room.roomId), ['session-2']);
  });

  it('returns false when the room is already absent', () => {
    const client = {
      _rooms: new Map([['session-2', { roomId: 'session-2', title: 'Other Session' }]]),
      _joinedRoomIds: new Set(['session-2']),
      get rooms() {
        return Array.from(this._rooms.values());
      },
    };

    assert.equal(evictRoomFromClientCache(client, 'session-1'), false);
    assert.deepEqual(client.rooms.map((room) => room.roomId), ['session-2']);
    assert.equal(client._joinedRoomIds.has('session-2'), true);
  });
});