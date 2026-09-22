# Changelog

## [1.0.0-beta.1] - Unreleased

### Added

- Initial preview of the Azure Web PubSub local emulator, available as the `awps-emulator`
  .NET tool for local development and testing.
- File-based event handler and event listener configuration reloads without restarting or
  disconnecting clients. Updates that fail settings validation are logged and not applied;
  removed Event Hubs clients are released after their in-flight sends finish.
- A Quick start for running the existing SDK chat sample with the emulator, including event
  handler configuration and the local HTTP SDK option.

See [supported features and limitations](SUPPORTED_FEATURES.md) for compatibility details.
This preview is not intended for production use.