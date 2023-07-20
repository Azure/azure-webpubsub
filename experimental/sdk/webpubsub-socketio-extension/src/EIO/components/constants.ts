// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export const WEBPUBSUB_TRANSPORT_NAME = "webpubsub";
export const WEBPUBSUB_CLIENT_CONNECTION_FILED_NAME = "webPubSubClientConnection";
export const WEBPUBSUB_CONNECT_RESPONSE_FIELD_NAME = "socketio";

// Reference: https://github.com/socketio/engine.io/blob/123b68c04f9e971f59b526e0f967a488ee6b0116/README.md?plain=1#L219
export const CONNECTION_ERROR_EVENT_NAME = "connection_error";
export const CONNECTION_ERROR_WEBPUBSUB_CODE = 6;
export const CONNECTION_ERROR_WEBPUBSUB_MESSAGE = "Web PubSub Extension Internal Error";

export const EIO_CONNECTION_ERROR = {
  UNKNOWN_TRANSPORT: 0,
  UNKNOWN_SID: 1,
  BAD_HANDSHAKE_METHOD: 2,
  BAD_REQUEST: 3,
  FORBIDDEN: 4,
  UNSUPPORTED_PROTOCOL_VERSION: 5,
};

export const TUNNEL_PATH = "/eventhandler/";
