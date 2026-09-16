const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { video } = require('../src/generated/video');

test('built application sends custom call and ack payloads with unchanged names', async () => {
  // Execute the actual UMD bundle with real text codecs, without a DOM or network.
  const context = vm.createContext({ TextEncoder, TextDecoder, module: { exports: {} }, exports: {} });
  vm.runInContext('globalThis.self = globalThis;', context);
  vm.runInContext(readFileSync(path.resolve(__dirname, '../dist/video.js'), 'utf8'), context, { displayErrors: false });
  const app = context.module.exports;
  const sent = [];
  const ws = { sendProtobufData: (group, bytes, typeName) => sent.push({ group, bytes, typeName }) };
  await app.callRequest(ws, 'alice', 'bob');
  for (const approved of [false, true]) await app.ackRequest(ws, approved, 'alice', 'bob');
  assert.equal(sent.length, 3);
  sent.forEach(({ group, bytes, typeName }, index) => {
    assert.equal(group, 'bob_control');
    const name = index === 0 ? 'CameraControl' : 'CameraControlAck';
    assert.equal(typeName, `video.${name}`);
    const payload = video[name].decode(Uint8Array.from(bytes));
    assert.equal(payload.sender, 'alice');
    assert.equal(payload.reciver, 'bob');
    if (index > 0) assert.equal(payload.approved, index === 2);
  });
});