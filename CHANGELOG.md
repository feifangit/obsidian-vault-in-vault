# Changelog

All notable changes to this project will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.3] - 2026-09-05

### Changed

- Final encryption prompts show `.ageconfig` exclusions in a separate collapsed path list.

## [0.6.2] - 2026-09-05

### Fixed

- Allow `.ageconfig` to contain only `exclude`; omitted extensions now use the built-in defaults.

## [0.6.1] - 2026-09-05

### Fixed

- Keep the encrypted source alive until its decrypted replacement has opened, preventing Obsidian from navigating back to the previous tab history entry.
- Wait until the last protected plaintext tab closes before showing the encryption prompt.

### Changed

- Encryption prompts include a collapsed list of affected files and explain that vault-wide locking forgets the cached session password.

## [0.6.0] - 2026-09-03

### Added

- Shared vault-root `.ageconfig` policies for protected extensions and exact file/directory exclusions.
- A settings-page policy source indicator, reload action, and fallback exclusion editor.

### Safety

- Invalid shared policies now block encryption instead of falling back to a broader policy.

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
