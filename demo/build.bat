@echo off
echo ========================================
echo  Tactical Range — Build ^& Package
echo ========================================
echo.
echo [1/3] Building TypeScript...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Build failed!
  pause
  exit /b 1
)
echo.
echo [2/3] Packaging .exe...
node build-nw.cjs
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Package failed!
  pause
  exit /b 1
)
echo.
echo [3/3] Building installer...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer.iss
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Installer build failed!
  pause
  exit /b 1
)
echo.
echo ========================================
echo  Done!
echo    EXE:       release\tactical-range.exe
echo    Installer: installer\TacticalRange-Setup-v1.0.0.exe
echo ========================================
pause
