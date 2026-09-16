const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const protobuf = require('protobufjs');
const { UpstreamMessage, DownstreamMessage } = require('../src/generated/webpubsub').azure.webpubsub;
const { video } = require('../src/generated/video');

// Independently load the source schemas to check generated wire compatibility.
const schema = protobuf.loadSync([
  path.resolve(__dirname, '../../../../protocols/protobuf.webpubsub.azure.v1/webpubsub.v1.proto'),
  path.resolve(__dirname, '../proto/pubsub.proto')
]);
const upstreamType = schema.lookupType('azure.webpubsub.UpstreamMessage');
const downstreamType = schema.lookupType('azure.webpubsub.DownstreamMessage');
const maxUint64 = '18446744073709551615';

test('join and ack retain uint64 IDs, including explicit optional zero', () => {
  for (const ackId of ['0', '2147483648', '9007199254740991', maxUint64]) {
    const join = UpstreamMessage.fromObject({ joinGroupMessage: { group: 'alice_control', ackId } });
    const decoded = upstreamType.decode(UpstreamMessage.encode(join).finish());
    assert.equal(decoded.message, 'joinGroupMessage');
    assert.equal(decoded.joinGroupMessage.group, 'alice_control');
    assert.equal(decoded.joinGroupMessage.ackId.toString(), ackId);
    assert.ok(Object.hasOwn(decoded.joinGroupMessage, 'ackId'));

    const ack = downstreamType.fromObject({ ackMessage: { ackId, success: true } });
    const received = DownstreamMessage.decode(downstreamType.encode(ack).finish());
    assert.equal(received.ackMessage.ackId.toString(), ackId);
    assert.equal(received.ackMessage.success, true);
  }
  const absent = UpstreamMessage.decode(UpstreamMessage.encode({ joinGroupMessage: { group: 'g' } }).finish());
  assert.equal(Object.hasOwn(absent.joinGroupMessage, 'ackId'), false);
});

test('canonical metadata, JSON, TTL, no-echo and sequence IDs survive the wire', () => {
  const sent = UpstreamMessage.fromObject({
    sendToGroupMessage: {
      group: 'alice_data', ackId: maxUint64, noEcho: true, ttlSeconds: 0,
      metadata: { source: 'camera' }, data: { jsonData: '{"ready":true}' }
    }
  });
  const decoded = upstreamType.decode(UpstreamMessage.encode(sent).finish()).sendToGroupMessage;
  assert.equal(decoded.ackId.toString(), maxUint64);
  assert.equal(decoded.noEcho, true);
  assert.equal(decoded.ttlSeconds, 0);
  assert.ok(Object.hasOwn(decoded, 'ttlSeconds'));
  assert.deepEqual(decoded.metadata, { source: 'camera' });
  assert.equal(decoded.data.data, 'jsonData');
  assert.equal(decoded.data.jsonData, '{"ready":true}');

  const received = downstreamType.fromObject({ dataMessage: {
    from: 'group', group: 'alice_data', sequenceId: maxUint64,
    metadata: decoded.metadata, data: { binaryData: Uint8Array.of(0, 128, 255) }
  } });
  const data = DownstreamMessage.decode(downstreamType.encode(received).finish()).dataMessage;
  assert.equal(data.sequenceId.toString(), maxUint64);
  assert.deepEqual(data.metadata, decoded.metadata);
  assert.equal(data.data.data, 'binaryData');
  assert.deepEqual(Array.from(data.data.binaryData), [0, 128, 255]);
});

test('video payloads stay separate and preserve their Any type URLs', () => {
  assert.deepEqual(Object.keys(video).sort(), ['CameraControl', 'CameraControlAck']);
  for (const name of ['CameraControl', 'CameraControlAck']) {
    const payloadType = video[name];
    const payload = payloadType.create({ shareId: 'share', sender: 'alice', reciver: 'bob', approved: true });
    const any = { type_url: `type.googleapis.com/video.${name}`, value: payloadType.encode(payload).finish() };
    const sent = UpstreamMessage.encode({ sendToGroupMessage: {
      group: 'bob_control', data: { protobufData: any }
    } }).finish();
    const packed = upstreamType.decode(sent).sendToGroupMessage.data.protobufData;
    assert.equal(packed.type_url, `type.googleapis.com/video.${name}`);
    const payloadSchema = schema.lookupType(`video.${name}`);
    const decoded = payloadSchema.decode(packed.value);
    assert.equal(decoded.sender, 'alice');
    assert.equal(decoded.reciver, 'bob');
    assert.equal(decoded.shareId, 'share');
    if (name === 'CameraControlAck') assert.equal(decoded.approved, true);

    const wire = downstreamType.encode({ dataMessage: { data: { protobufData: packed } } }).finish();
    const received = DownstreamMessage.decode(wire).dataMessage.data;
    assert.equal(received.data, 'protobufData');
    assert.equal(received.protobufData.type_url, any.type_url);
    assert.deepEqual(payloadType.decode(received.protobufData.value), payloadType.decode(any.value));
  }
});

test('current stream and group-state fields are generated, including signed timestamps', () => {
  const stream = UpstreamMessage.fromObject({ streamDataMessage: {
    streamId: 's', streamSequenceId: maxUint64, data: { textData: 'frame' }
  } });
  const decoded = upstreamType.decode(UpstreamMessage.encode(stream).finish());
  assert.equal(decoded.streamDataMessage.streamSequenceId.toString(), maxUint64);
  for (const updatedAt of ['-9223372036854775808', '9223372036854775807']) {
    const snapshot = downstreamType.fromObject({ groupStateSnapshotMessage: {
      group: 'g', sequenceId: maxUint64,
      items: [{ connectionId: 'c', updatedAt, state: { entries: { status: 'ready' } } }]
    } });
    const state = DownstreamMessage.decode(downstreamType.encode(snapshot).finish()).groupStateSnapshotMessage;
    assert.equal(state.sequenceId.toString(), maxUint64);
    assert.equal(state.items[0].updatedAt.toString(), updatedAt);
    assert.deepEqual(state.items[0].state.entries, { status: 'ready' });
  }
});