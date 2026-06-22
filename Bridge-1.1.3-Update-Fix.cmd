@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%scripts\repair-1.1.3-update.ps1"
if not exist "%PS_SCRIPT%" set "PS_SCRIPT=%SCRIPT_DIR%repair-1.1.3-update.ps1"

if not exist "%PS_SCRIPT%" (
  echo Cannot find repair script: %PS_SCRIPT%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -KeepWindow %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Repair failed with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
