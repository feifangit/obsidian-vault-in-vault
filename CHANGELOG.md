# Changelog

All notable changes to this project will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-09-03

### Added

- Native Markdown and image access for passphrase-encrypted age files.
- In-place, verified encryption and decryption while preserving subfolders.
- Prompt to encrypt the current file or all matching plaintext after its last tab closes.
- Vault-wide lock command, configurable protected extensions, and embedded-image decryption.
- Offline-only operation and session-only optional password caching.
- Automated tests, metadata validation, local installation helper, CI, and draft release workflow.

### Changed

- Renamed the pre-release project and plugin ID to Vault in Vault (`vault-in-vault`).
- Limited the initial compatibility declaration to desktop while the file lifecycle is tested.
