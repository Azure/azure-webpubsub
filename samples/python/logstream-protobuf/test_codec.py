"""Offline checks for the generated canonical codec; runnable with unittest or pytest."""

import importlib
import unittest

from google.protobuf.wrappers_pb2 import StringValue

from generate_proto import generate


class CodecTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Also makes existing pytest-based sample CI work from a clean checkout.
        generate()
        cls.pb = importlib.import_module('generated.webpubsub.v1_pb2')

    def test_canonical_schema_and_streamer_import(self):
        self.assertEqual(self.pb.DESCRIPTOR.name, 'webpubsub.v1.proto')
        self.assertEqual(self.pb.DESCRIPTOR.package, 'azure.webpubsub')
        self.assertIs(importlib.import_module('stream').UpstreamMessage, self.pb.UpstreamMessage)

    def test_join_and_ack_uint64_and_optional_presence(self):
        for ack_id in (0, 2**31, 2**53 - 1, 2**64 - 1):
            with self.subTest(ack_id=ack_id):
                join = self.pb.UpstreamMessage()
                join.join_group_message.group = 'stream'
                self.assertFalse(join.join_group_message.HasField('ack_id'))
                join.join_group_message.ack_id = ack_id
                decoded = self.pb.UpstreamMessage.FromString(join.SerializeToString())
                self.assertEqual(decoded.WhichOneof('message'), 'join_group_message')
                self.assertEqual(decoded.join_group_message.group, 'stream')
                self.assertTrue(decoded.join_group_message.HasField('ack_id'))
                self.assertEqual(decoded.join_group_message.ack_id, ack_id)

                ack = self.pb.DownstreamMessage()
                ack.ack_message.ack_id = ack_id
                ack.ack_message.success = True
                received = self.pb.DownstreamMessage.FromString(ack.SerializeToString())
                self.assertEqual(received.ack_message.ack_id, ack_id)
                self.assertTrue(received.ack_message.success)

    def test_metadata_json_and_sequence_ids(self):
        upstream = self.pb.UpstreamMessage()
        send = upstream.send_to_group_message
        send.group = 'stream'
        send.ack_id = 2**64 - 1
        send.no_echo = True
        send.ttl_seconds = 0
        send.metadata['source'] = 'logger'
        send.data.json_data = '{"ready":true}'
        decoded = self.pb.UpstreamMessage.FromString(upstream.SerializeToString()).send_to_group_message
        self.assertEqual(decoded, send)
        self.assertEqual(decoded.data.WhichOneof('data'), 'json_data')
        self.assertTrue(decoded.HasField('ttl_seconds'))

        downstream = self.pb.DownstreamMessage()
        data = downstream.data_message
        data.sequence_id = 2**64 - 1
        data.metadata.update(send.metadata)
        data.data.binary_data = bytes([0, 128, 255])
        received = self.pb.DownstreamMessage.FromString(downstream.SerializeToString()).data_message
        self.assertEqual(received, data)

    def test_any_payload_round_trip(self):
        upstream = self.pb.UpstreamMessage()
        payload = StringValue(value='log entry')
        upstream.send_to_group_message.data.protobuf_data.Pack(payload)
        decoded = self.pb.UpstreamMessage.FromString(upstream.SerializeToString())
        packed = decoded.send_to_group_message.data.protobuf_data
        self.assertEqual(packed.type_url, 'type.googleapis.com/google.protobuf.StringValue')
        downstream = self.pb.DownstreamMessage()
        downstream.data_message.data.protobuf_data.CopyFrom(packed)
        received = self.pb.DownstreamMessage.FromString(downstream.SerializeToString())
        unpacked = StringValue()
        self.assertTrue(received.data_message.data.protobuf_data.Unpack(unpacked))
        self.assertEqual(unpacked, payload)

    def test_current_stream_and_group_state_fields(self):
        upstream = self.pb.UpstreamMessage()
        upstream.stream_data_message.stream_id = 's'
        upstream.stream_data_message.stream_sequence_id = 2**64 - 1
        self.assertEqual(self.pb.UpstreamMessage.FromString(upstream.SerializeToString()), upstream)
        for updated_at in (-2**63, 2**63 - 1):
            with self.subTest(updated_at=updated_at):
                downstream = self.pb.DownstreamMessage()
                snapshot = downstream.group_state_snapshot_message
                snapshot.group = 'g'
                snapshot.sequence_id = 2**64 - 1
                item = snapshot.items.add(connection_id='c', updated_at=updated_at)
                item.state.entries['status'] = 'ready'
                self.assertEqual(self.pb.DownstreamMessage.FromString(downstream.SerializeToString()), downstream)


if __name__ == '__main__':
    unittest.main()