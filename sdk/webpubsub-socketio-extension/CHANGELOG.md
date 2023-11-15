
# Change Log

All notable changes to this project will be documented in this file.

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