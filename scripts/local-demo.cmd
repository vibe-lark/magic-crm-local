@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-demo.ps1" %*
set "LOCAL_DEMO_EXIT=%ERRORLEVEL%"
if not "%LOCAL_DEMO_EXIT%"=="0" pause
exit /b %LOCAL_DEMO_EXIT%
