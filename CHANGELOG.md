# Changelog

Entries up to 0.0.5 were reconstructed from the commit history on 2026-11-13.

## 0.0.6 (2026-11-13)

### Security

- A storage limit per member (default 5 GB) and a cap on each member's unfinished uploads
  (default 3), so no one member can fill the total.
- File names lose invisible and direction-changing marks, so a file's type reads as it is, and are
  capped by character, so a name never breaks the download header.

### Fixed

- A range whose last byte comes before its first is ignored, as RFC 9110 says, instead of refused.

### Changed

- `bun audit` runs weekly as well as on every push, in its own workflow (`.github/workflows/audit.yml`), so a new advisory shows up even when nothing is pushed.
- The repo is now `shiver-temp-share`; the plugin id stays `temp-share`, so existing shares carry
  on.
- The docs follow the Shiver standard ([docs/standards.md](docs/standards.md)): AGENTS.md,
  ARCHITECTURE.md, SECURITY.md, RELEASING.md and docs/decisions.md are new. CI checks the docs, the
  versions, the tests, the dependencies and the types.

## 0.0.5 (2026-11-11)

### Added

- A switch to show the button in every channel again. Deleting the sharing channel resets it.

## 0.0.4 (2026-11-11)

### Added

- A file sharing channel setting, to show the button only there.

## 0.0.3 (2026-11-11)

### Changed

- Renamed to Shiver Temp Share; the logo ships with the plugin.

## 0.0.2 (2026-11-11)

### Changed

- The composer button and the cards use Sharkord's own Button and Popover.

## 0.0.1 (2026-11-11)

- The first release: share large files with links that expire after a time or a number of
  downloads.
