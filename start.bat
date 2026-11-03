@echo off
setlocal
cd /d "%~dp0"
title Daily English

where node.exe >nul 2>&1
if errorlevel 1 goto NODE_MISSING

where npm.cmd >nul 2>&1
if errorlevel 1 goto NPM_MISSING

if not exist "node_modules\.bin\vite.cmd" goto INSTALL_DEPS
goto START_APP

:INSTALL_DEPS
echo First run: installing local dependencies...
echo This may take a few minutes.
call npm.cmd install
if errorlevel 1 goto INSTALL_FAILED

:START_APP
echo.
echo Starting Daily English...
echo The app will open at http://127.0.0.1:5173
echo Keep this window open while using the app.
echo.
call npm.cmd run dev
set "APP_EXIT_CODE=%ERRORLEVEL%"
if not "%APP_EXIT_CODE%"=="0" goto START_FAILED
exit /b 0

:NODE_MISSING
echo.
echo Node.js was not found.
echo Please install Node.js 18 or newer, then try again.
echo.
pause
exit /b 1

:NPM_MISSING
echo.
echo npm was not found.
echo Reinstall Node.js with npm, then try again.
echo.
pause
exit /b 1

:INSTALL_FAILED
echo.
echo Dependency installation failed.
echo Check the internet connection and try again.
echo.
pause
exit /b 1

:START_FAILED
echo.
echo The app did not start. Error code: %APP_EXIT_CODE%
echo Port 5173 may be occupied, or another copy may already be running.
echo Close other app windows and try again.
echo.
pause
exit /b %APP_EXIT_CODE%
