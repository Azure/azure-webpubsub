# Changelog

## [1.0.0-beta.11] - 2024-11-11
### Improved
- Improve upstream sample code for net8
- Support optional scheme for -u upstream url
- Demote connection logs to verbose

## [1.0.0-beta.10] - 2024-09-21
### Improved
- Some improvements to the REST API tab

## [1.0.0-beta.9] - 2024-09-20
### Improved
- Add a format view of the upstream requests and response
- Add a InvokeService tab in the app server pannel
- Support AzurePowerShellCredential

## [1.0.0-beta.8] - 2024-04-10
### Fixed
- Fix the issue when connection string still set, the tool still tries to read endpoint setting

## [1.0.0-beta.7] - 2024-04-09
### Added
- Support passing --connection option when running the tunnel

### Fixed
- `--endpoint` should override the environment WebPubSubConnectionString variable

## [1.0.0-beta.6] - 2024-03-15
### Fixed
- Fix test client URL generation when env is used

## [1.0.0-beta.5] - 2024-03-11
### Fixed
- Fix test client bugs

## [1.0.0-beta.4] - 2024-03-06
### Changed
- Add subprotocol test client

## [1.0.0-beta.3] - 2023-12-27
### Fixed
- Fix #643: inject LiveTrace view has display issue

## [1.0.0-beta.2] - 2023-12-11
### Changed
- Improve the helper messages and descriptions

## [1.0.0-beta.1] - 2023-12-11
### Added
- Initial beta release
