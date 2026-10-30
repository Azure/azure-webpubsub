# Changelog

## [1.0.0-beta3] - 2026-11-01

### Breaking Changes

- Rename `refMessageId` to `replyTo` in message models and schemas.
- Remove `extMentions`, `extDeleteAfterRead`, and `extScheduled` from message creation schemas.

### Features Added

- Add optional, nullable `mentions` arrays to message models and creation schemas. Entries must be non-null strings.
- Support `mentions` and `replyTo` in `sendToRoom()` options, outgoing messages, and local sender message events.

## [1.0.0-beta.2] - 2026-06-30

### Breaking Changes

- Remove the `getUserProfile()` method from `ChatClient` and its associated `GetUserProfileOptions` type.

## [1.0.0-beta.1] - 2026-06-09

- Initial beta release of `@azure/web-pubsub-chat-client`, the client SDK for Azure Web PubSub Chat.
