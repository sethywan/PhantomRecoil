# Phantom Recoil v1.0.20

## Overview
This release fixes the updater flow so native builds can update automatically on app startup without manually opening GitHub.

## Updater Improvements
- Replaced browser-based update prompt with automatic update apply logic.
- Added release asset download directly from GitHub Releases API.
- Added SHA256 verification using `SHA256SUMS.txt` when present.
- Added in-place self-replace update flow for writable install locations.
- Added silent installer fallback when direct binary replacement is not possible.
- App now exits cleanly when updater handoff is active and restarts via helper process.

## Release Reliability
- Added tests for updater helper logic:
  - SHA256SUMS parsing
  - asset selection behavior
  - installer asset preference by tag
- Synced runtime version, installer version, and CI `APP_VERSION` to `1.0.20`.

## Verification
- Unit tests: `26 passed`.
