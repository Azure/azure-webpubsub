
# Change Log

All notable changes to this project will be documented in this file.

## [1.2.0] - 2024-6-25

### Dependencies
- [`socket.io@~4.7.2`](https://github.com/socketio/socket.io/tree/4.7.2) ([diff](https://github.com/socketio/socket.io/compare/4.6.1...4.7.2)) [#762](https://github.com/Azure/azure-webpubsub/pull/762)

### Bug Fixes
- Avoid using private method from Engine.IO [#763](https://github.com/Azure/azure-webpubsub/pull/763)

## [1.1.0] - 2024-3-19

- Messages sending to the same room or broadcast can guarantee order [#665](https://github.com/Azure/azure-webpubsub/pull/665)

## [1.0.1] - 2023-11-17

- Fix a bug in passport authentication mechanism [#653](https://github.com/Azure/azure-webpubsub/pull/653)

## [1.0.0] - 2023-11-16

- GA version
- Downgrade the dependency `@azure/web-pubsub` to stable version

## [1.0.0-beta.6] - 2023-09-19

### Features

- **BREAKING CHANGE** Remove `configureNegotiateOptions` in `AzureSocketIOCommonOptions` and add `negotiate` middleware instead [#596](https://github.com/Azure/azure-webpubsub/pull/596)
- Add `usePassport` and `restorePassport` for passport integration [#596](https://github.com/Azure/azure-webpubsub/pull/596)

### Bug Fixes

- Fix async issue in `UseAzureSocketIO` [#603](https://github.com/Azure/azure-webpubsub/pull/603)

## [1.0.0-beta.5] - 2023-08-21

- Init preview version for @azure/web-pubsub-socket.io