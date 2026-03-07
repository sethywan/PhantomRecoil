# Phantom Recoil

Phantom Recoil is a Windows desktop application (Python + PyWebView) for configuring recoil profiles with DPI-aware scaling.

## Scope
- Desktop UI for operator and weapon profile selection.
- Runtime recoil loop with Caps Lock activation guard.
- Persistent local preferences (DPI, favorites).
- Optional update notification based on GitHub releases.

## Security Model
- The updater does not download or execute binaries automatically.
- Update prompts open the official GitHub releases page only.
- Users should verify downloaded binaries with SHA256 checksums.
- Public releases should be Authenticode-signed for publisher authenticity.

## Recommended Public Download
For end users, use the installer release asset:
- `PhantomRecoilSetup_vX.Y.Z.exe`

This avoids manual build or script usage and provides a standard Windows installation flow.

## Download Verification
Verify release artifact hashes in PowerShell:

```powershell
Get-FileHash .\PhantomRecoilSetup_vX.Y.Z.exe -Algorithm SHA256
Get-FileHash .\Phantom_Recoil_Standalone.exe -Algorithm SHA256
```

Compare the resulting hash with `SHA256SUMS.txt` from the same release.

If releases are code-signed, verify signer identity:

```powershell
Get-AuthenticodeSignature .\PhantomRecoilSetup_vX.Y.Z.exe
```

Status should be `Valid` and the signer should match your publisher identity.

## Run From Source
Requirements:
- Windows
- Python 3.9+

Run:

```bat
START.bat
```

`START.bat` installs required dependencies and launches `ui_app.py`.

## Build
Build distributable binaries:

```bat
BUILD.bat
```

Artifacts:
- `Phantom_Recoil.exe` (onedir runtime)
- `Phantom_Recoil_Standalone.exe` (onefile distribution)
- `PhantomRecoilSetup_vX.Y.Z.exe` (Inno Setup installer)
- `SHA256SUMS.txt` (hash output)

`BUILD.bat` performs preflight validation and exits with explicit errors when prerequisites are missing.

## Launch Built Binary

```bat
PLAY.bat
```

`PLAY.bat` invokes `BUILD.bat` automatically if the standalone executable is not present and stops on build failures.

## Tests
Run all unit tests:

```bat
python -m unittest discover -s tests -p "test_*.py"
```

## Continuous Integration
The workflow in `.github/workflows/build.yml` performs:
1. Dependency installation
2. Unit test execution
3. Standalone executable build
4. Installer build (Inno Setup)
5. SHA256 generation for executable and installer
6. Artifact upload (executable, installer, checksum)

## Repository Structure
- `ui_app.py`: application entry point and PyWebView API bridge.
- `macro.py`: recoil runtime loop.
- `updater.py`: release check and user notification logic.
- `web/`: frontend assets (`index.html`, `script.js`, `style.css`, `data.js`).
- `tests/`: unit tests.
- `installer.iss`: installer definition for Inno Setup.
- `RELEASE_CHECKLIST.md`: release procedure for public publishing.
