# Changelog

## [1.0.0-beta.3]

### Added

- Native `linux/arm64` Docker images alongside `linux/amd64`, including support for Apple Silicon.

## [1.0.0-beta.2]

### Fixed

- Support `GET /api/health` alongside `HEAD` for compatibility with service health checks.

## [1.0.0-beta.1]

### Added

- Initial preview of the Azure Web PubSub local emulator, available as the `awps-emulator`
  .NET tool for local development and testing.
- Run the emulator locally with Docker.
- Hot reload for `EventHandlers` and `EventListeners` in `appsettings.json`.
- A Quick start for running the existing SDK chat sample with the emulator, including event
  handler configuration and the local HTTP SDK option.

See [supported features and limitations](SUPPORTED_FEATURES.md) for compatibility details.
This preview is not intended for production use.