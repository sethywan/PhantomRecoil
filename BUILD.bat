@echo off
echo ==============================================
echo  R6 Recoil - Enterprise Auto-Build Orchestrator
echo ==============================================
echo.

:: Check for PyInstaller
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo [System] Installing PyInstaller compiler...
    pip install pyinstaller >nul 2>&1
)

echo [System] Cleaning old build remnants...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist R6_Recoil.spec del R6_Recoil.spec

echo [System] Compiling Phantom_Recoil.exe with Pyinstaller...
pyinstaller --noconfirm --onedir --windowed --noconsole --name "Phantom_Recoil" --icon="icon.ico" --add-data "web;web" --add-data "icon.ico;." "ui_app.py"

:: Move the EXE up and clean the ugly PyInstaller folders
echo [System] Packaging application...
move dist\Phantom_Recoil\Phantom_Recoil.exe .\ >nul 2>&1
copy dist\Phantom_Recoil\_internal\*.* _internal\ >nul 2>&1

:: Create a standalone ONE-FILE compile
pyinstaller --noconfirm --onefile --windowed --noconsole --name "Phantom_Recoil_Standalone" --icon="icon.ico" --add-data "web;web" --add-data "icon.ico;." "ui_app.py"

echo.
echo ==============================================
echo  SUCCESS!
echo  Your executable is ready: dist\Phantom_Recoil_Standalone.exe
echo ==============================================
pause
