# Changelog

## [1.0.0-beta.1] - Unreleased

### Added

- Initial preview of the Azure Web PubSub local emulator, available as the `awps-emulator`
  .NET tool for local development and testing.
- File-based event handler and event listener configuration reloads without restarting or
  disconnecting clients. Invalid edits retain the last valid configuration; removed Event Hubs
  clients are released after their in-flight sends finish.
- A standalone Getting started example under the emulator directory, including event handlers
  and local HTTP SDK calls, without an Azure resource or tunnel.

See [supported features and limitations](SUPPORTED_FEATURES.md) for compatibility details.
This preview is not intended for production use.