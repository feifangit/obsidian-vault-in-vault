# Changelog

All notable changes to this project will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Documentation

- Added installation steps for finding Vault in Vault in Obsidian's Community plugins browser.

## [0.7.4] - 2026-09-12

### Fixed

- Restored compatibility with Obsidian 1.5.0 by replacing file lookups introduced in 1.5.7 with the earlier abstract-file API.
- Updated settings headings and composite icon elements to follow Obsidian's UI guidelines, including removing the redundant plugin-name heading.

### Changed

- Release drafts now contain only the three assets supported by Obsidian: `main.js`, `manifest.json`, and `styles.css`.

## [0.7.3] - 2026-09-11

### Documentation

- Added screenshots for shared-policy exclusions and session security settings.
- Added a generated PNG guide to Ribbon security modes and password-status colors.
- Simplified the README introduction into a scannable explanation of the problems the plugin solves.
- Clarified how the automated draft Release becomes an installable published Release.
- Removed unreleased development versions from `versions.json` before the first public Release.

## [0.7.2] - 2026-09-05

### Fixed

- Render the session security setting labels as normal text instead of `[object DocumentFragment]` while retaining their composite mode icons.

## [0.7.1] - 2026-09-05

### Changed

- The ribbon distinguishes password auto-clear with a key-and-clock icon and automatic idle lock with a lock-and-refresh icon.
- Session security settings show the same composite icons as the ribbon while the red, green, and yellow bar remains dedicated to password status.

## [0.7.0] - 2026-09-05

### Added

- Red, green, and yellow status light beneath the ribbon lock to show whether the password is cached and whether a security timer is close to expiring.
- Mutually exclusive password auto-clear and Vault inactivity auto-lock timers.
- Best-effort Vault activity tracking across the main window and popout windows without relying on filesystem timestamps.

### Safety

- Automatic idle lock flushes Markdown editors, validates `.ageconfig`, encrypts and verifies each matching plaintext file, closes successfully protected tabs, and clears the password.
- Failed files retain their plaintext source, and configuration or save failures stop the operation before protected tabs are closed.

## [0.6.4] - 2026-09-05

### Added

- Settings actions to open `.ageconfig` with the system default editor or reveal it in the desktop file manager.

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
