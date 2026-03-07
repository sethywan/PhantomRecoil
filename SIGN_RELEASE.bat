@echo off
setlocal EnableExtensions
echo ==============================================
echo  Phantom Recoil - Sign Release Artifacts
echo ==============================================
echo.

if "%~1"=="" (
  echo Usage: SIGN_RELEASE.bat ^<VERSION^>
  echo Example: SIGN_RELEASE.bat 1.0.13
  exit /b 1
)

set "APP_VERSION=%~1"
set "SETUP_FILE=dist\PhantomRecoilSetup_v%APP_VERSION%.exe"
set "STANDALONE_FILE=dist\Phantom_Recoil_Standalone.exe"

if "%SIGN_PFX_FILE%"=="" (
  echo [ERROR] Missing SIGN_PFX_FILE environment variable.
  echo Example: set SIGN_PFX_FILE=C:\secure\codesign.pfx
  exit /b 1
)

if "%SIGN_PFX_PASSWORD%"=="" (
  echo [ERROR] Missing SIGN_PFX_PASSWORD environment variable.
  exit /b 1
)

if not exist "%SIGN_PFX_FILE%" (
  echo [ERROR] PFX file not found: %SIGN_PFX_FILE%
  exit /b 1
)

where signtool >nul 2>&1
if errorlevel 1 (
  echo [ERROR] signtool.exe not found in PATH.
  echo Install Windows SDK and ensure signtool is available.
  exit /b 1
)

if not exist "%STANDALONE_FILE%" (
  echo [ERROR] Missing file: %STANDALONE_FILE%
  exit /b 1
)

if not exist "%SETUP_FILE%" (
  echo [ERROR] Missing file: %SETUP_FILE%
  exit /b 1
)

echo [System] Signing standalone executable...
signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f "%SIGN_PFX_FILE%" /p "%SIGN_PFX_PASSWORD%" "%STANDALONE_FILE%"
if errorlevel 1 (
  echo [ERROR] Failed to sign %STANDALONE_FILE%
  exit /b 1
)

echo [System] Signing installer...
signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f "%SIGN_PFX_FILE%" /p "%SIGN_PFX_PASSWORD%" "%SETUP_FILE%"
if errorlevel 1 (
  echo [ERROR] Failed to sign %SETUP_FILE%
  exit /b 1
)

echo [System] Verifying signatures...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-AuthenticodeSignature '%STANDALONE_FILE%' | Format-List Status,SignerCertificate,TimeStamperCertificate"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-AuthenticodeSignature '%SETUP_FILE%' | Format-List Status,SignerCertificate,TimeStamperCertificate"

echo.
echo [SUCCESS] Files signed and verified.
echo.
endlocal
