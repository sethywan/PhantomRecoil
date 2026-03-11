# Phantom Recoil v1.0.21

## Overview
This release finalizes the native auto-update flow and improves behavior on non-writable install locations.

## Updater Fixes
- Native app now checks updates on startup and applies them automatically.
- If the app location is writable, updater performs in-place binary replacement and restart.
- If the app location is not writable, updater now launches a user-local updated binary from `%LOCALAPPDATA%\PhantomRecoil\updates`.
- Silent installer fallback remains available when installer assets are published in releases.
- SHA256 verification is applied using `SHA256SUMS.txt` when available.

## Version Sync
- Runtime updater version: `v1.0.21`
- Installer default version: `1.0.21`
- CI `APP_VERSION`: `1.0.21`

## Verification
- Unit tests: `26 passed`.
